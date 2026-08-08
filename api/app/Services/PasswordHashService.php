<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Hash;

final class PasswordHashService
{
    public function matches(string $plainText, string $hash): bool
    {
        return password_verify($plainText, $hash);
    }

    public function verifyAndUpgrade(User $user, string $plainText): bool
    {
        if (! $this->matches($plainText, $user->password_hash)) {
            return false;
        }

        if (Hash::needsRehash($user->password_hash)) {
            $user->forceFill(['password_hash' => Hash::make($plainText)])->save();
        }

        return true;
    }
}
