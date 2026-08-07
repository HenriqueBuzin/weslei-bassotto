<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $user_id
 * @property string $jti_hash
 * @property bool $remember
 * @property Carbon $created_at
 * @property Carbon $expires_at
 * @property Carbon|null $revoked_at
 * @property string|null $revoke_reason
 * @property string|null $replaced_by_hash
 */
class RefreshSession extends Model
{
    use HasRecordId;

    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'jti_hash',
        'remember',
        'created_at',
        'expires_at',
        'revoked_at',
        'revoke_reason',
        'replaced_by_hash',
    ];

    protected function casts(): array
    {
        return [
            'remember' => 'boolean',
            'created_at' => 'datetime',
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }
}
