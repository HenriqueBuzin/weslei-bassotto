<?php

declare(strict_types=1);

namespace Tests\Unit;

/**
 * Test double for a path that passes is_file() but fails to open, which is what
 * a deleted or permission-stripped secret file looks like at read time.
 */
final class UnreadableStream
{
    public const PROTOCOL = 'unreadable-secret';

    /** @var resource|null */
    public $context;

    public static function register(): void
    {
        if (! in_array(self::PROTOCOL, stream_get_wrappers(), true)) {
            stream_wrapper_register(self::PROTOCOL, self::class);
        }
    }

    public function stream_open(): bool
    {
        return false;
    }

    /**
     * @return array<int|string, int>
     */
    public function url_stat(): array
    {
        // 0100000 is S_IFREG, the bit is_file() looks for.
        return ['mode' => 0100000 | 0444, 'size' => 1];
    }
}
