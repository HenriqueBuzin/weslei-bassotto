<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\RefreshSession;
use App\Support\RecordId;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class RefreshSessionService
{
    public function __construct(private readonly TokenService $tokens) {}

    public static function hashJti(string $jti): string
    {
        return hash('sha256', $jti);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array{0: string, 1: string}|null The user id and the stored jti hash.
     */
    public function identity(array $payload): ?array
    {
        $subject = RecordId::normalize($payload['sub'] ?? null);
        $jti = $payload['jti'] ?? null;

        if ($subject === null || ! is_string($jti) || $jti === '') {
            return null;
        }

        return [$subject, self::hashJti($jti)];
    }

    public function issue(string $userId, Carbon $expiresAt, bool $remember): string
    {
        $jti = Str::random(43);

        $this->store($userId, self::hashJti($jti), $remember, $expiresAt);

        return $this->tokens->createRefreshToken($userId, $expiresAt, [
            'rm' => $remember ? 1 : 0,
            'jti' => $jti,
        ]);
    }

    /**
     * Rotates the presented session. Returns null when the token was already
     * used, revoked or expired; a replayed token revokes the whole family.
     *
     * @param  array<string, mixed>  $payload
     */
    public function rotate(array $payload, Carbon $expiresAt): ?string
    {
        $identity = $this->identity($payload);

        if ($identity === null) {
            return null;
        }

        [$userId, $currentHash] = $identity;
        $remember = (bool) ($payload['rm'] ?? 0);
        $nextJti = Str::random(43);
        $nextHash = self::hashJti($nextJti);

        $rotated = RefreshSession::query()
            ->where('user_id', $userId)
            ->where('jti_hash', $currentHash)
            ->whereNull('revoked_at')
            ->where('expires_at', '>', Carbon::now())
            ->update([
                'revoked_at' => Carbon::now(),
                'revoke_reason' => 'rotated',
                'replaced_by_hash' => $nextHash,
            ]);

        if ($rotated !== 1) {
            $replayed = RefreshSession::query()
                ->where('user_id', $userId)
                ->where('jti_hash', $currentHash)
                ->exists();

            if ($replayed) {
                $this->revokeAllForUser($userId, 'reuse_detected');
            }

            return null;
        }

        $this->store($userId, $nextHash, $remember, $expiresAt);

        return $this->tokens->createRefreshToken($userId, $expiresAt, [
            'rm' => $remember ? 1 : 0,
            'jti' => $nextJti,
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function revoke(array $payload, string $reason = 'logout'): bool
    {
        $identity = $this->identity($payload);

        if ($identity === null) {
            return false;
        }

        [$userId, $jtiHash] = $identity;

        return RefreshSession::query()
            ->where('user_id', $userId)
            ->where('jti_hash', $jtiHash)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => Carbon::now(), 'revoke_reason' => $reason]) === 1;
    }

    public function revokeAllForUser(string $userId, string $reason): int
    {
        return RefreshSession::query()
            ->where('user_id', $userId)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => Carbon::now(), 'revoke_reason' => $reason]);
    }

    private function store(string $userId, string $jtiHash, bool $remember, Carbon $expiresAt): void
    {
        RefreshSession::query()->create([
            'user_id' => $userId,
            'jti_hash' => $jtiHash,
            'remember' => $remember,
            'created_at' => Carbon::now(),
            'expires_at' => $expiresAt,
            'revoked_at' => null,
            'revoke_reason' => null,
            'replaced_by_hash' => null,
        ]);
    }
}
