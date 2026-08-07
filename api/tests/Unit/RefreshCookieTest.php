<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\RefreshCookie;
use Illuminate\Support\Facades\Config;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Symfony only accepts '', 'lax', 'none' or 'strict', so the configured value is
 * narrowed before it gets there instead of being passed through as any string.
 */
final class RefreshCookieTest extends TestCase
{
    #[DataProvider('sameSiteProvider')]
    public function test_the_cookie_carries_the_configured_samesite(string $configured, string $expected): void
    {
        Config::set('platform.cookie.samesite', $configured);

        $this->assertSame($expected, RefreshCookie::make('token', 3600)->getSameSite());
        $this->assertSame($expected, RefreshCookie::forget()->getSameSite());
    }

    /**
     * @return iterable<string, array{0: string, 1: string}>
     */
    public static function sameSiteProvider(): iterable
    {
        yield 'lax' => ['lax', 'lax'];
        yield 'none' => ['none', 'none'];
        yield 'strict' => ['strict', 'strict'];
        yield 'uppercase is normalised' => ['STRICT', 'strict'];
        yield 'anything unexpected falls back to lax' => ['whatever', 'lax'];
    }
}
