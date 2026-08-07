<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\LoginAttempt;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Config;

class LoginThrottleService
{
    public function isLocked(string $email): bool
    {
        $record = $this->find($email);

        return $record?->locked_until !== null && $record->locked_until->greaterThan(Carbon::now());
    }

    /**
     * Counts a failed attempt, restarting the window once it has elapsed and
     * locking the account when the configured ceiling is reached.
     */
    public function registerFailure(string $email): void
    {
        $now = Carbon::now();
        $windowMinutes = (int) Config::get('platform.login.window_minutes');
        $lockMinutes = (int) Config::get('platform.login.lock_minutes');
        $maxAttempts = (int) Config::get('platform.login.max_attempts');

        $record = $this->find($email);
        $windowStart = $now->copy()->subMinutes($windowMinutes);
        $withinWindow = $record?->started_at !== null && $record->started_at->greaterThan($windowStart);

        $attempts = $withinWindow ? $record->attempts + 1 : 1;

        LoginAttempt::query()->updateOrCreate(['email' => $email], [
            'attempts' => $attempts,
            'started_at' => $withinWindow ? $record->started_at : $now,
            'locked_until' => $attempts >= $maxAttempts ? $now->copy()->addMinutes($lockMinutes) : null,
            'expires_at' => $now->copy()->addMinutes($windowMinutes + $lockMinutes),
        ]);
    }

    public function clear(string $email): void
    {
        LoginAttempt::query()->where('email', $email)->delete();
    }

    private function find(string $email): ?LoginAttempt
    {
        return LoginAttempt::query()->where('email', $email)->first();
    }
}
