<?php

declare(strict_types=1);

namespace App\Support;

use InvalidArgumentException;

/**
 * Normalizes and validates the platform environment contract shared by the
 * Compose files, the CI pipeline and the VPS `.env` files.
 */
final class PlatformEnv
{
    public const JWT_ALGORITHMS = ['HS256', 'RS256', 'ES256'];

    public const SAMESITE = ['lax', 'none', 'strict'];

    public const ENVIRONMENTS = ['dev', 'prod'];

    public static function apiBase(mixed $value): string
    {
        $base = trim((string) $value);

        if (! str_starts_with($base, '/')) {
            $base = '/'.$base;
        }

        return rtrim($base, '/') ?: '/';
    }

    public static function appEnv(mixed $value): string
    {
        return strtolower(trim((string) $value));
    }

    /**
     * Accepts a JSON array, a comma separated list, or the `*` wildcard.
     *
     * @return list<string>
     */
    public static function origins(mixed $value): array
    {
        if (is_array($value)) {
            return array_values(array_map('strval', $value));
        }

        $raw = trim((string) $value);

        if ($raw === '') {
            return [];
        }

        if ($raw === '*') {
            return ['*'];
        }

        if (str_starts_with($raw, '[')) {
            $decoded = json_decode($raw, true);

            if (is_array($decoded)) {
                return array_values(array_map(fn ($item) => trim((string) $item), $decoded));
            }
        }

        return self::commaList($raw);
    }

    /**
     * @return list<string>
     */
    public static function gatewayOrder(mixed $value): array
    {
        if (is_array($value)) {
            return array_values(array_map('strval', $value));
        }

        return self::commaList((string) $value ?: 'mercado_pago');
    }

    public static function bool(mixed $value, bool $default = false): bool
    {
        if (is_bool($value)) {
            return $value;
        }

        if ($value === null || $value === '') {
            return $default;
        }

        return in_array(strtolower(trim((string) $value)), ['1', 'true', 'yes', 'on'], true);
    }

    public static function cookiePath(mixed $value): string
    {
        $path = trim((string) $value) ?: '/';

        return str_starts_with($path, '/') ? $path : '/'.$path;
    }

    public static function nullableString(mixed $value): ?string
    {
        return trim((string) $value) ?: null;
    }

    /**
     * @param  array<string, mixed>  $config
     *
     * @throws InvalidArgumentException
     */
    public static function validate(array $config): void
    {
        if (! in_array($config['env'], self::ENVIRONMENTS, true)) {
            throw new InvalidArgumentException("APP_ENV must be 'dev' or 'prod'");
        }

        if (trim((string) $config['database_url']) === '') {
            throw new InvalidArgumentException('DATABASE_URL is required');
        }

        self::validateJwt($config);
        self::validateCookies($config);
        self::validatePositive($config);
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private static function validateJwt(array $config): void
    {
        $algorithm = strtoupper((string) $config['jwt']['algorithm']);

        if (! in_array($algorithm, self::JWT_ALGORITHMS, true)) {
            throw new InvalidArgumentException('JWT_ALG is invalid. Use one of: '.implode(', ', self::JWT_ALGORITHMS));
        }

        $secret = (string) $config['jwt']['secret'];

        if (str_starts_with($algorithm, 'HS')) {
            if (strlen($secret) < 32) {
                throw new InvalidArgumentException('JWT_SECRET is too short for HS*. Use 32+ characters.');
            }

            return;
        }

        if ($secret === '') {
            throw new InvalidArgumentException('JWT_SECRET cannot be empty, even with RS/ES.');
        }
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private static function validateCookies(array $config): void
    {
        $cookie = $config['cookie'];

        if (! in_array($cookie['samesite'], self::SAMESITE, true)) {
            throw new InvalidArgumentException("COOKIE_SAMESITE must be 'lax', 'none' or 'strict'");
        }

        if ($cookie['samesite'] === 'none' && ! $cookie['secure']) {
            throw new InvalidArgumentException(
                'COOKIE_SAMESITE=None requires COOKIE_SECURE=true. '.
                'Use COOKIE_SAMESITE=lax in dev or enable HTTPS + Secure.'
            );
        }

        if (preg_match('/^[A-Za-z0-9_\-]+$/', (string) $cookie['refresh_name']) !== 1) {
            throw new InvalidArgumentException('REFRESH_COOKIE_NAME is invalid: use letters, digits, _ or -');
        }
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private static function validatePositive(array $config): void
    {
        $positives = [
            'ACCESS_TOKEN_EXPIRES_MINUTES' => $config['jwt']['access_expires_minutes'],
            'REFRESH_TOKEN_EXPIRES_SHORT_HOURS' => $config['jwt']['refresh_expires_short_hours'],
            'REFRESH_TOKEN_EXPIRES_LONG_DAYS' => $config['jwt']['refresh_expires_long_days'],
            'LOGIN_MAX_ATTEMPTS' => $config['login']['max_attempts'],
            'LOGIN_ATTEMPT_WINDOW_MINUTES' => $config['login']['window_minutes'],
            'LOGIN_LOCK_MINUTES' => $config['login']['lock_minutes'],
            'PASSWORD_RESET_EXPIRES_MINUTES' => $config['password_reset']['expires_minutes'],
        ];

        foreach ($positives as $name => $value) {
            if ((int) $value <= 0) {
                throw new InvalidArgumentException("{$name} must be greater than zero");
            }
        }
    }

    /**
     * @return list<string>
     */
    private static function commaList(string $raw): array
    {
        return array_values(array_filter(array_map('trim', explode(',', $raw)), fn ($item) => $item !== ''));
    }
}
