<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\ConsultancySubmission;
use App\Models\SubmissionAnswerRevision;
use App\Models\SubmissionRenewal;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ConsultancySubmission */
class SubmissionResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'customer' => [
                'name' => $this->customer_name,
                'email' => $this->customer_email,
                'phone' => $this->customer_phone,
            ],
            'plan' => [
                'slug' => $this->plan_slug,
                'name' => $this->plan_name,
                'months' => $this->plan_months,
                'start_date' => $this->plan_start_date?->toDateString(),
                'end_date' => $this->plan_end_date?->toDateString(),
            ],
            'status' => $this->status,
            'payment_reference' => $this->payment_reference,
            'payment_gateway' => $this->payment_gateway,
            'answers' => $this->answers,
            'answer_revisions' => $this->revisions
                ->map(fn (SubmissionAnswerRevision $revision): array => [
                    'answers' => $revision->answers,
                    'changed_at' => $revision->changed_at->toIso8601String(),
                    'changed_by' => $revision->changed_by,
                ])
                ->all(),
            'answers_changed_at' => $this->answers_changed_at?->toIso8601String(),
            'answers_seen_at' => $this->answers_seen_at?->toIso8601String(),
            'renewal_count' => $this->renewal_count,
            'renewals' => $this->renewals
                ->map(fn (SubmissionRenewal $renewal): array => [
                    'plan_slug' => $renewal->plan_slug,
                    'plan_name' => $renewal->plan_name,
                    'months' => $renewal->months,
                    'start_date' => $renewal->start_date->toDateString(),
                    'end_date' => $renewal->end_date->toDateString(),
                    'payment_id' => $renewal->payment_id,
                    'gateway' => $renewal->gateway,
                    'payment_reference' => $renewal->payment_reference,
                    'created_at' => $renewal->created_at->toIso8601String(),
                ])
                ->all(),
            'questionnaire_changed_at' => $this->questionnaire_changed_at?->toIso8601String(),
            'recurrence_status' => $this->recurrence_status,
            'recurrence_issue' => $this->recurrence_issue,
            'created_at' => $this->created_at->toIso8601String(),
            'updated_at' => $this->updated_at->toIso8601String(),
        ];
    }
}
