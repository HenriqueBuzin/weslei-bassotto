<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $email
 * @property string $password_hash
 * @property bool $must_change_password
 * @property Carbon $created_at
 * @property Carbon $updated_at
 * @property-read Collection<int, Role> $roles
 */
class User extends Model
{
    use HasRecordId;

    protected $fillable = ['email', 'password_hash', 'must_change_password'];

    protected $hidden = ['password_hash'];

    protected $attributes = ['must_change_password' => false];

    protected function casts(): array
    {
        return [
            'must_change_password' => 'boolean',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsToMany<Role, $this>
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class);
    }

    /**
     * @return list<string>
     */
    public function roleNames(): array
    {
        // array_values garante a lista: para o PHPStan, Collection::values() ainda
        // pode ter chaves fora de sequencia.
        return array_values($this->roles->map(fn (Role $role): string => $role->name)->all());
    }

    public function hasAnyRole(string ...$names): bool
    {
        return $this->roles->whereIn('name', $names)->isNotEmpty();
    }
}
