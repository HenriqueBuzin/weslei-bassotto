<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $email
 * @property int $attempts
 * @property Carbon $started_at
 * @property Carbon|null $locked_until
 * @property Carbon $expires_at
 */
class LoginAttempt extends Model
{
    use HasRecordId;

    public $timestamps = false;

    protected $fillable = ['email', 'attempts', 'started_at', 'locked_until', 'expires_at'];

    protected function casts(): array
    {
        return [
            'attempts' => 'integer',
            'started_at' => 'datetime',
            'locked_until' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }
}
