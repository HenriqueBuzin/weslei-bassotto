<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $plan_slug
 * @property string $mode
 * @property string $amount
 * @property string $payer_email
 * @property string|null $account_email
 * @property string|null $gateway
 * @property string|null $external_id
 * @property string $status
 * @property string|null $status_detail
 * @property string|null $claim_token_hash
 * @property string|null $claimed_submission_id
 * @property string|null $renewal_submission_id
 * @property Carbon|null $contract_activated_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Payment extends Model
{
    use HasRecordId;

    protected $fillable = [
        'plan_slug',
        'mode',
        'amount',
        'payer_email',
        'account_email',
        'renewal_submission_id',
        'claim_token_hash',
        'status',
        'status_detail',
        'gateway',
        'external_id',
        'claimed_submission_id',
        'contract_activated_at',
    ];

    protected $hidden = ['claim_token_hash'];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'contract_activated_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @return HasMany<PaymentAttempt, $this>
     */
    public function attempts(): HasMany
    {
        return $this->hasMany(PaymentAttempt::class);
    }
}
