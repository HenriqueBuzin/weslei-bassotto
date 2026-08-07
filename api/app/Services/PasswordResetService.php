<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\PasswordResetToken;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class PasswordResetService
{
    public static function hashToken(string $token): string
    {
        return hash('sha256', $token);
    }

    public function smtpConfigured(): bool
    {
        return (string) Config::get('mail.mailers.smtp.username') !== ''
            && (string) Config::get('mail.mailers.smtp.password') !== '';
    }

    /**
     * Invalidates any pending token before issuing a fresh one.
     */
    public function issueToken(User $user): string
    {
        $token = Str::random(43);
        $now = Carbon::now();

        PasswordResetToken::query()
            ->where('user_id', $user->id)
            ->whereNull('used_at')
            ->update(['used_at' => $now]);

        PasswordResetToken::query()->create([
            'user_id' => $user->id,
            'token_hash' => self::hashToken($token),
            'created_at' => $now,
            'expires_at' => $now->copy()->addMinutes((int) Config::get('platform.password_reset.expires_minutes')),
            'used_at' => null,
        ]);

        return $token;
    }

    public function resetUrl(string $token): string
    {
        return rtrim((string) Config::get('app.url'), '/').'/redefinir-senha?token='.$token;
    }

    public function sendResetEmail(string $email, string $resetUrl): void
    {
        $minutes = (int) Config::get('platform.password_reset.expires_minutes');

        $body = implode("\n", [
            __('mail.password_reset.intro'),
            '',
            __('mail.password_reset.action', ['url' => $resetUrl]),
            '',
            __('mail.password_reset.expiry', ['minutes' => $minutes]),
            __('mail.password_reset.ignore'),
        ]);

        Mail::raw($body, function ($message) use ($email): void {
            $message->to($email)->subject(__('mail.password_reset.subject'));
        });
    }

    /**
     * Consumes the token atomically so a link can never be replayed.
     */
    public function consumeToken(string $token): ?PasswordResetToken
    {
        $hash = self::hashToken($token);
        $now = Carbon::now();

        $record = PasswordResetToken::query()
            ->where('token_hash', $hash)
            ->whereNull('used_at')
            ->where('expires_at', '>', $now)
            ->first();

        if ($record === null) {
            return null;
        }

        $claimed = PasswordResetToken::query()
            ->whereKey($record->id)
            ->whereNull('used_at')
            ->update(['used_at' => $now]);

        return $claimed === 1 ? $record->refresh() : null;
    }
}
