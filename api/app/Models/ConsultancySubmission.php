<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $customer_name
 * @property string $customer_email
 * @property string $customer_phone
 * @property string $plan_slug
 * @property string $plan_name
 * @property int $plan_months
 * @property Carbon|null $plan_start_date
 * @property Carbon|null $plan_end_date
 * @property string $status
 * @property string|null $payment_id
 * @property string|null $payment_reference
 * @property string|null $payment_gateway
 * @property array<int, array<string, mixed>> $answers
 * @property Carbon|null $answers_changed_at
 * @property Carbon|null $answers_seen_at
 * @property Carbon|null $questionnaire_changed_at
 * @property int $renewal_count
 * @property Carbon|null $last_renewed_at
 * @property string|null $recurrence_status
 * @property string|null $recurrence_issue
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class ConsultancySubmission extends Model
{
    use HasRecordId;

    protected $fillable = [
        'customer_name',
        'customer_email',
        'customer_phone',
        'plan_slug',
        'plan_name',
        'plan_months',
        'plan_start_date',
        'plan_end_date',
        'status',
        'payment_id',
        'payment_reference',
        'payment_gateway',
        'answers',
        'answers_changed_at',
        'answers_seen_at',
        'questionnaire_changed_at',
        'renewal_count',
        'recurrence_status',
        'recurrence_issue',
        'last_renewed_at',
    ];

    protected function casts(): array
    {
        return [
            'plan_months' => 'integer',
            'plan_start_date' => 'date',
            'plan_end_date' => 'date',
            'answers' => 'array',
            'answers_changed_at' => 'datetime',
            'answers_seen_at' => 'datetime',
            'questionnaire_changed_at' => 'datetime',
            'renewal_count' => 'integer',
            'last_renewed_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @return HasMany<SubmissionAnswerRevision, $this>
     */
    public function revisions(): HasMany
    {
        return $this->hasMany(SubmissionAnswerRevision::class, 'submission_id');
    }

    /**
     * @return HasMany<SubmissionRenewal, $this>
     */
    public function renewals(): HasMany
    {
        return $this->hasMany(SubmissionRenewal::class, 'submission_id');
    }

    public function isOwnedBy(string $email): bool
    {
        return strtolower($this->customer_email) === strtolower($email);
    }
}
