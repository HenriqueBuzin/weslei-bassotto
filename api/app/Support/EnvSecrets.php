<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Reads Compose secrets mounted as files (`<NAME>_FILE`) into the environment
 * so `env()` resolves them like any plain variable.
 */
final class EnvSecrets
{
    public const NAMES = [
        'APP_KEY',
        'DATABASE_URL',
        'JWT_SECRET',
        'MERCADO_PAGO_ACCESS_TOKEN',
        'MERCADO_PAGO_WEBHOOK_SECRET',
        'SMTP_PASSWORD',
    ];

    /**
     * Laravel's env repository is immutable, so values published here win over
     * anything later read from `.env`.
     */
    public static function hydrate(): void
    {
        foreach (self::NAMES as $name) {
            $value = self::read($name);

            if ($value !== null) {
                $_ENV[$name] = $value;
                $_SERVER[$name] = $value;
                putenv($name.'='.$value);
            }
        }
    }

    private static function read(string $name): ?string
    {
        $path = $_SERVER[$name.'_FILE'] ?? $_ENV[$name.'_FILE'] ?? getenv($name.'_FILE');

        if (! is_string($path) || $path === '' || ! is_file($path)) {
            return null;
        }

        $contents = @file_get_contents($path);

        if (! is_string($contents)) {
            return null;
        }

        $value = rtrim($contents, "\r\n");

        return $value === '' ? null : $value;
    }
}
