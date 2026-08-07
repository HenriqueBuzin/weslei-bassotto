<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * The datetime casts are invisible to static analysis without these, which is
 * why calls like ->toIso8601String() looked like calls on a string.
 *
 * @property string $id
 * @property string $type
 * @property string|null $submission_id
 * @property string|null $payment_id
 * @property Carbon|null $seen_at
 * @property Carbon $created_at
 */
class AdminEvent extends Model
{
    use HasRecordId;

    public $timestamps = false;

    protected $fillable = ['type', 'submission_id', 'payment_id', 'seen_at', 'created_at'];

    protected function casts(): array
    {
        return [
            'seen_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }
}
