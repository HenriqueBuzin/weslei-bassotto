<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $gateway
 * @property string $event_id
 * @property string|null $external_id
 * @property Carbon $received_at
 * @property bool $matched
 */
class PaymentWebhookEvent extends Model
{
    use HasRecordId;

    public $timestamps = false;

    protected $fillable = ['gateway', 'event_id', 'external_id', 'received_at', 'matched'];

    protected function casts(): array
    {
        return [
            'received_at' => 'datetime',
            'matched' => 'boolean',
        ];
    }
}
