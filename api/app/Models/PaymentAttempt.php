<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $payment_id
 * @property string $gateway
 * @property string $status
 * @property string|null $external_id
 * @property string|null $detail
 * @property Carbon $created_at
 */
class PaymentAttempt extends Model
{
    use HasRecordId;

    public $timestamps = false;

    protected $fillable = ['payment_id', 'gateway', 'status', 'external_id', 'detail', 'created_at'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }
}
