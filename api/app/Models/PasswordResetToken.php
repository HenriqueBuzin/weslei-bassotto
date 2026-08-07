<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $user_id
 * @property string $token_hash
 * @property Carbon $created_at
 * @property Carbon $expires_at
 * @property Carbon|null $used_at
 */
class PasswordResetToken extends Model
{
    use HasRecordId;

    public $timestamps = false;

    protected $fillable = ['user_id', 'token_hash', 'created_at', 'expires_at', 'used_at'];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
        ];
    }
}
