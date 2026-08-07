<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Stable 24 character hexadecimal identifier used by every API record.
 */
final class RecordId
{
    public static function generate(): string
    {
        return bin2hex(random_bytes(12));
    }

    public static function isValid(mixed $value): bool
    {
        return is_string($value) && preg_match('/^[0-9a-fA-F]{24}$/', $value) === 1;
    }

    public static function normalize(mixed $value): ?string
    {
        return self::isValid($value) ? strtolower((string) $value) : null;
    }
}
