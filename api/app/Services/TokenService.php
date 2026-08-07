<?php

declare(strict_types=1);

namespace App\Services;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Throwable;

class TokenService
{
    public function __construct(
        private readonly string $secret,
        private readonly string $algorithm,
        private readonly int $accessExpiresMinutes,
    ) {}

    /**
     * @param  list<string>  $roles
     */
    public function createAccessToken(string $subject, array $roles): string
    {
        return $this->encode([
            'sub' => $subject,
            'roles' => $roles,
        ], Carbon::now()->addMinutes($this->accessExpiresMinutes), 'access');
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    public function createRefreshToken(string $subject, Carbon $expiresAt, array $claims = []): string
    {
        return $this->encode([
            'sub' => $subject,
            'jti' => Str::random(43),
            ...$claims,
        ], $expiresAt, 'refresh');
    }

    /**
     * @return array<string, mixed>|null Null when the token is invalid or expired.
     */
    public function decode(string $token): ?array
    {
        try {
            return (array) JWT::decode($token, new Key($this->secret, $this->algorithm));
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function encode(array $payload, Carbon $expiresAt, string $type): string
    {
        $now = Carbon::now();

        return JWT::encode([
            ...$payload,
            'type' => $type,
            'iat' => $now->getTimestamp(),
            'exp' => $expiresAt->getTimestamp(),
        ], $this->secret, $this->algorithm);
    }
}
