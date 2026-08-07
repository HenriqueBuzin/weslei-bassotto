<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\PlanCatalog;
use App\Exceptions\ApiException;
use App\Http\Requests\Consultancy\AnswersUpdateRequest;
use App\Http\Requests\Consultancy\SubmissionStoreRequest;
use App\Http\Resources\QuestionResource;
use App\Http\Resources\SubmissionResource;
use App\Models\ConsultancySubmission;
use App\Models\Payment;
use App\Models\User;
use App\Services\ConsultancyService;
use App\Services\ContractService;
use App\Services\PaymentService;
use App\Support\RecordId;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;

class ConsultancyController extends Controller
{
    public function __construct(
        private readonly ConsultancyService $consultancy,
        private readonly PaymentService $payments,
        private readonly ContractService $contracts,
    ) {}

    public function questions(): AnonymousResourceCollection
    {
        return QuestionResource::collection($this->consultancy->activeQuestions());
    }

    public function store(SubmissionStoreRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $payment = $this->payments->findApprovedByClaim(
            $request->string('payment_id')->value(),
            $request->string('payment_token')->value(),
        );

        if ($payment === null) {
            throw ApiException::paymentRequired('approved_payment_required', 'An approved payment is required before answering');
        }

        $this->assertPaymentUsableFor($payment, $request->string('plan_slug')->value(), $user);

        $customerEmail = strtolower((string) $request->input('customer.email'));

        if ($customerEmail !== strtolower($user->email)) {
            throw ApiException::conflict('customer_email_mismatch', 'The student e-mail must match the account e-mail');
        }

        $answers = $this->consultancy->buildAnswerSnapshot($request->answers());
        $plan = PlanCatalog::get($payment->plan_slug);
        [$start, $end] = PlanCatalog::contractPeriod($plan->months);
        $now = Carbon::now();

        $submission = ConsultancySubmission::query()->create([
            'customer_name' => (string) $request->input('customer.name'),
            'customer_email' => $customerEmail,
            'customer_phone' => (string) $request->input('customer.phone'),
            'plan_slug' => $plan->slug,
            'plan_name' => $plan->name,
            'plan_months' => $plan->months,
            'plan_start_date' => $start,
            'plan_end_date' => $end,
            'status' => 'active',
            'payment_id' => $payment->id,
            'payment_reference' => $payment->external_id,
            'payment_gateway' => $payment->gateway,
            'answers' => $answers,
            'answers_changed_at' => $now,
            'answers_seen_at' => null,
            'renewal_count' => 0,
            'recurrence_status' => $payment->status,
            'recurrence_issue' => null,
        ]);

        // Claiming the payment atomically prevents two submissions from one purchase.
        $claimed = Payment::query()
            ->whereKey($payment->id)
            ->whereNull('claimed_submission_id')
            ->update(['claimed_submission_id' => $submission->id, 'updated_at' => $now]);

        if ($claimed !== 1) {
            $submission->delete();

            throw ApiException::conflict('payment_already_used', 'This payment was already used');
        }

        $this->contracts->recordAdminEvent('new_contract', $submission->id, $payment->id);

        return SubmissionResource::make($this->hydrate($submission))->response()->setStatusCode(201);
    }

    public function mySubmissions(Request $request): AnonymousResourceCollection
    {
        /** @var User $user */
        $user = $request->user();

        $submissions = ConsultancySubmission::with(['revisions', 'renewals'])
            ->where('customer_email', strtolower($user->email))
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        return SubmissionResource::collection($submissions);
    }

    public function updateAnswers(string $submissionId, AnswersUpdateRequest $request): SubmissionResource
    {
        /** @var User $user */
        $user = $request->user();

        $submission = $this->findOwned($submissionId, $user);
        $answers = $this->consultancy->buildAnswerSnapshot($request->answers());
        $now = Carbon::now();

        $submission->revisions()->create([
            'answers' => $submission->answers,
            'changed_at' => $now,
            'changed_by' => 'subscriber',
        ]);

        $submission->fill([
            'answers' => $answers,
            'answers_changed_at' => $now,
            'answers_seen_at' => null,
            // Reviewed: the banner asking them to refill has served its purpose.
            'questionnaire_changed_at' => null,
        ])->save();

        $this->contracts->recordAdminEvent('answers_changed', $submission->id);

        return SubmissionResource::make($this->hydrate($submission->refresh()));
    }

    private function assertPaymentUsableFor(Payment $payment, string $planSlug, User $user): void
    {
        if ($payment->plan_slug !== $planSlug || $payment->renewal_submission_id !== null) {
            throw ApiException::conflict('payment_plan_mismatch', 'The payment does not match this purchase');
        }

        if (strtolower((string) $payment->account_email) !== strtolower($user->email)) {
            throw ApiException::forbidden('payment_owned_by_another_account', 'This payment belongs to another account');
        }

        if ($payment->claimed_submission_id !== null) {
            throw ApiException::conflict('payment_already_used', 'This payment was already used');
        }
    }

    private function findOwned(string $submissionId, User $user): ConsultancySubmission
    {
        $id = RecordId::normalize($submissionId);

        if ($id === null) {
            throw ApiException::badRequest('invalid_id', 'The provided identifier is malformed');
        }

        $submission = ConsultancySubmission::query()->find($id);

        if ($submission === null) {
            throw ApiException::notFound('submission_not_found', 'Contract not found');
        }

        if (! $submission->isOwnedBy($user->email)) {
            throw ApiException::forbidden('submission_not_owned', 'You cannot change this questionnaire');
        }

        return $submission;
    }

    private function hydrate(ConsultancySubmission $submission): ConsultancySubmission
    {
        return $submission->load(['revisions', 'renewals']);
    }
}
