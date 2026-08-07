<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Models\ConsultancySubmission;
use App\Models\ContractEvent;
use App\Models\Payment;
use App\Models\SubmissionRenewal;
use App\Payments\PaymentStatus;
use App\Services\ContractService;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Exercises the guards that only trigger when two requests interleave. Each one
 * is reproduced deterministically by mutating the row mid-flight.
 */
final class RaceConditionTest extends TestCase
{
    public function test_a_payment_claimed_mid_flight_rolls_the_submission_back(): void
    {
        $user = $this->createUser('aluno@example.com');
        $question = $this->createQuestion(['required' => false]);
        [$payment, $claimToken] = $this->createApprovedPayment();
        $competitor = $this->createSubmission(['customer_email' => 'outro@example.com']);

        // Simulates a concurrent request claiming the payment between the insert
        // and the atomic claim update.
        ConsultancySubmission::created(function () use ($payment, $competitor): void {
            Payment::query()->whereKey($payment->id)->update(['claimed_submission_id' => $competitor->id]);
        });

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('consultancy/submissions'), [
                'plan_slug' => 'trimestral',
                'customer' => ['name' => 'Aluno', 'email' => 'aluno@example.com', 'phone' => '5554999999999'],
                'answers' => [['question_id' => $question->id, 'value' => 'ok']],
                'payment_id' => $payment->id,
                'payment_token' => $claimToken,
            ])
            ->assertStatus(409)
            ->assertJsonPath('code', 'payment_already_used');

        // Only the competitor's contract survives: the rollback removed ours.
        $this->assertSame(1, ConsultancySubmission::query()->count());
        $this->assertSame($competitor->id, ConsultancySubmission::query()->firstOrFail()->id);
    }

    public function test_activating_an_already_activated_payment_returns_the_same_contract(): void
    {
        $submission = $this->createSubmission();
        $payment = $this->approvedRenewalPayment($submission->id);

        $contracts = app(ContractService::class);

        $first = $contracts->activate($payment);
        $second = $contracts->activate($payment->refresh());

        $this->assertNotNull($first);
        $this->assertNotNull($second);
        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, SubmissionRenewal::query()->count());
        $this->assertSame(1, $submission->refresh()->renewal_count);
    }

    public function test_a_second_activation_without_a_contract_event_returns_nothing(): void
    {
        $submission = $this->createSubmission();
        $payment = $this->approvedRenewalPayment($submission->id);

        app(ContractService::class)->activate($payment);
        ContractEvent::query()->delete();

        $this->assertNull(app(ContractService::class)->activate($payment->refresh()));
    }

    public function test_a_duplicate_contract_event_is_swallowed(): void
    {
        $submission = $this->createSubmission();
        $payment = $this->approvedRenewalPayment($submission->id);

        ContractEvent::query()->create([
            'payment_id' => $payment->id,
            'submission_id' => $submission->id,
            'type' => 'contract_activated',
            'created_at' => Carbon::now(),
        ]);

        $this->assertNotNull(app(ContractService::class)->activate($payment));
        $this->assertSame(1, ContractEvent::query()->count());
        $this->assertSame(1, $submission->refresh()->renewal_count);
    }

    private function approvedRenewalPayment(string $submissionId): Payment
    {
        [$payment] = $this->createApprovedPayment([
            'status' => PaymentStatus::Approved->value,
            'renewal_submission_id' => $submissionId,
        ]);

        return $payment;
    }
}
