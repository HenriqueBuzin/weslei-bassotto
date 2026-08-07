<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $submission_id
 * @property string $plan_slug
 * @property string $plan_name
 * @property int $months
 * @property Carbon $start_date
 * @property Carbon $end_date
 * @property string|null $payment_id
 * @property string|null $gateway
 * @property string|null $payment_reference
 * @property Carbon $created_at
 */
class SubmissionRenewal extends Model
{
    use HasRecordId;

    public $timestamps = false;

    protected $fillable = [
        'submission_id',
        'plan_slug',
        'plan_name',
        'months',
        'start_date',
        'end_date',
        'payment_id',
        'gateway',
        'payment_reference',
        'created_at',
    ];

    protected function casts(): array
    {
        return [
            'months' => 'integer',
            'start_date' => 'date',
            'end_date' => 'date',
            'created_at' => 'datetime',
        ];
    }
}
