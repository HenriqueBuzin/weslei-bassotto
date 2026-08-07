<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Http\Requests\Consultancy\QuestionStoreRequest;
use App\Http\Requests\Consultancy\QuestionUpdateRequest;
use App\Http\Requests\Consultancy\SubmissionUpdateRequest;
use App\Http\Resources\AdminEventResource;
use App\Http\Resources\QuestionResource;
use App\Http\Resources\SubmissionResource;
use App\Models\AdminEvent;
use App\Models\ConsultancyQuestion;
use App\Models\ConsultancySubmission;
use App\Services\ConsultancyService;
use App\Support\RecordId;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;

class ConsultancyAdminController extends Controller
{
    public function __construct(private readonly ConsultancyService $consultancy) {}

    public function questions(): AnonymousResourceCollection
    {
        return QuestionResource::collection(
            ConsultancyQuestion::query()->ordered()->limit(200)->get()
        );
    }

    public function storeQuestion(QuestionStoreRequest $request): JsonResponse
    {
        $question = ConsultancyQuestion::query()->create($request->toColumns());
        $this->consultancy->markQuestionnaireChanged();

        return QuestionResource::make($question)->response()->setStatusCode(201);
    }

    public function updateQuestion(string $questionId, QuestionUpdateRequest $request): QuestionResource
    {
        $question = $this->findQuestion($questionId);
        $patch = $request->patch();

        if ($patch !== []) {
            $question->fill($patch)->save();
            $this->consultancy->markQuestionnaireChanged();
        }

        return QuestionResource::make($question);
    }

    public function destroyQuestion(string $questionId): Response
    {
        $this->findQuestion($questionId)->delete();
        $this->consultancy->markQuestionnaireChanged();

        return new Response('', 204);
    }

    public function submissions(): AnonymousResourceCollection
    {
        $submissions = ConsultancySubmission::with(['revisions', 'renewals'])
            ->orderByDesc('created_at')
            ->limit(500)
            ->get();

        return SubmissionResource::collection($submissions);
    }

    public function updateSubmission(string $submissionId, SubmissionUpdateRequest $request): SubmissionResource
    {
        $submission = $this->findSubmission($submissionId);
        $patch = $request->patch();

        if ($patch !== []) {
            $submission->fill($patch)->save();
        }

        return SubmissionResource::make($submission->load(['revisions', 'renewals']));
    }

    public function markAnswersSeen(string $submissionId): SubmissionResource
    {
        $submission = $this->findSubmission($submissionId);
        $now = Carbon::now();

        $submission->fill(['answers_seen_at' => $now])->save();

        AdminEvent::query()
            ->where('submission_id', $submission->id)
            ->where('type', 'answers_changed')
            ->whereNull('seen_at')
            ->update(['seen_at' => $now]);

        return SubmissionResource::make($submission->load(['revisions', 'renewals']));
    }

    public function events(): AnonymousResourceCollection
    {
        return AdminEventResource::collection(
            AdminEvent::query()->orderByDesc('created_at')->limit(500)->get()
        );
    }

    public function markEventSeen(string $eventId): JsonResponse
    {
        $event = AdminEvent::query()->find($eventId);

        if ($event === null) {
            throw ApiException::notFound('admin_event_not_found', 'Alert not found');
        }

        $event->fill(['seen_at' => Carbon::now()])->save();

        return new JsonResponse(['ok' => true]);
    }

    private function findQuestion(string $questionId): ConsultancyQuestion
    {
        $question = ConsultancyQuestion::query()->find($this->recordId($questionId));

        if ($question === null) {
            throw ApiException::notFound('question_not_found', 'Question not found');
        }

        return $question;
    }

    private function findSubmission(string $submissionId): ConsultancySubmission
    {
        $submission = ConsultancySubmission::query()->find($this->recordId($submissionId));

        if ($submission === null) {
            throw ApiException::notFound('submission_not_found', 'Contract not found');
        }

        return $submission;
    }

    private function recordId(string $value): string
    {
        $id = RecordId::normalize($value);

        if ($id === null) {
            throw ApiException::badRequest('invalid_id', 'The provided identifier is malformed');
        }

        return $id;
    }
}
