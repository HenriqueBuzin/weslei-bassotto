<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string|null $payment_id
 * @property string|null $submission_id
 * @property string $type
 * @property Carbon $created_at
 */
class ContractEvent extends Model
{
    use HasRecordId;

    public $timestamps = false;

    protected $fillable = ['payment_id', 'submission_id', 'type', 'created_at'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }
}
