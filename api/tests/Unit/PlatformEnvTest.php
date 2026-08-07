<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\PlatformEnv;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class PlatformEnvTest extends TestCase
{
    #[DataProvider('apiBaseProvider')]
    public function test_normalizes_the_api_base(mixed $raw, string $expected): void
    {
        $this->assertSame($expected, PlatformEnv::apiBase($raw));
    }

    /**
     * @return iterable<string, array{0: mixed, 1: string}>
     */
    public static function apiBaseProvider(): iterable
    {
        yield 'already normalized' => ['/api/v1', '/api/v1'];
        yield 'adds the leading slash' => ['api/v1', '/api/v1'];
        yield 'drops the trailing slash' => ['/api/v1/', '/api/v1'];
        yield 'trims whitespace' => ['  /api/v1  ', '/api/v1'];
        yield 'root stays root' => ['/', '/'];
        yield 'empty becomes root' => ['', '/'];
        yield 'null becomes root' => [null, '/'];
    }

    public function test_lowercases_the_environment(): void
    {
        $this->assertSame('prod', PlatformEnv::appEnv(' PROD '));
        $this->assertSame('', PlatformEnv::appEnv(null));
    }

    /**
     * @param  list<string>  $expected
     */
    #[DataProvider('originsProvider')]
    public function test_parses_cors_origins(mixed $raw, array $expected): void
    {
        $this->assertSame($expected, PlatformEnv::origins($raw));
    }

    /**
     * @return iterable<string, array{0: mixed, 1: list<string>}>
     */
    public static function originsProvider(): iterable
    {
        yield 'json array' => ['["https://a.com","https://b.com"]', ['https://a.com', 'https://b.com']];
        yield 'json array with padding' => ['[" https://a.com "]', ['https://a.com']];
        yield 'comma separated' => ['https://a.com, https://b.com', ['https://a.com', 'https://b.com']];
        yield 'single value' => ['https://a.com', ['https://a.com']];
        yield 'wildcard' => ['*', ['*']];
        yield 'empty' => ['', []];
        yield 'null' => [null, []];
        yield 'real array passes through' => [['https://a.com'], ['https://a.com']];
        yield 'malformed json falls back to comma split' => ['[oops', ['[oops']];
        yield 'json object falls back to comma split' => ['{"a":1}', ['{"a":1}']];
        yield 'drops empty entries' => ['https://a.com,,  ,https://b.com', ['https://a.com', 'https://b.com']];
    }

    /**
     * @param  list<string>  $expected
     */
    #[DataProvider('gatewayOrderProvider')]
    public function test_parses_the_gateway_order(mixed $raw, array $expected): void
    {
        $this->assertSame($expected, PlatformEnv::gatewayOrder($raw));
    }

    /**
     * @return iterable<string, array{0: mixed, 1: list<string>}>
     */
    public static function gatewayOrderProvider(): iterable
    {
        yield 'single gateway' => ['mercado_pago', ['mercado_pago']];
        yield 'multiple gateways' => ['mercado_pago, stripe', ['mercado_pago', 'stripe']];
        yield 'real array passes through' => [['stripe'], ['stripe']];
        yield 'empty falls back to the default' => ['', ['mercado_pago']];
        yield 'null falls back to the default' => [null, ['mercado_pago']];
    }

    #[DataProvider('boolProvider')]
    public function test_parses_booleans(mixed $raw, bool $default, bool $expected): void
    {
        $this->assertSame($expected, PlatformEnv::bool($raw, $default));
    }

    /**
     * @return iterable<string, array{0: mixed, 1: bool, 2: bool}>
     */
    public static function boolProvider(): iterable
    {
        yield 'string true' => ['true', false, true];
        yield 'uppercase true' => ['TRUE', false, true];
        yield 'one' => ['1', false, true];
        yield 'yes' => ['yes', false, true];
        yield 'on' => ['on', false, true];
        yield 'string false' => ['false', true, false];
        yield 'zero' => ['0', true, false];
        yield 'garbage is false' => ['maybe', true, false];
        yield 'real boolean true' => [true, false, true];
        yield 'real boolean false' => [false, true, false];
        yield 'null uses the default' => [null, true, true];
        yield 'empty uses the default' => ['', true, true];
    }

    public function test_normalizes_the_cookie_path(): void
    {
        $this->assertSame('/api/v1/auth', PlatformEnv::cookiePath('/api/v1/auth'));
        $this->assertSame('/api/v1/auth', PlatformEnv::cookiePath('api/v1/auth'));
        $this->assertSame('/', PlatformEnv::cookiePath(''));
        $this->assertSame('/', PlatformEnv::cookiePath(null));
    }

    public function test_blank_strings_become_null(): void
    {
        $this->assertSame('.example.com', PlatformEnv::nullableString(' .example.com '));
        $this->assertNull(PlatformEnv::nullableString('   '));
        $this->assertNull(PlatformEnv::nullableString(null));
    }

    public function test_accepts_a_valid_configuration(): void
    {
        PlatformEnv::validate(self::config());

        $this->expectNotToPerformAssertions();
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('invalidConfigProvider')]
    public function test_rejects_an_invalid_configuration(array $overrides, string $expectedMessage): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage($expectedMessage);

        PlatformEnv::validate(self::config($overrides));
    }

    /**
     * @return iterable<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidConfigProvider(): iterable
    {
        yield 'unknown environment' => [['env' => 'staging'], "APP_ENV must be 'dev' or 'prod'"];
        yield 'missing database url' => [['database_url' => '   '], 'DATABASE_URL is required'];
        yield 'unknown jwt algorithm' => [
            ['jwt' => ['algorithm' => 'HS512']],
            'JWT_ALG is invalid. Use one of: HS256, RS256, ES256',
        ];
        yield 'short hmac secret' => [
            ['jwt' => ['secret' => 'curto']],
            'JWT_SECRET is too short for HS*. Use 32+ characters.',
        ];
        yield 'empty asymmetric secret' => [
            ['jwt' => ['algorithm' => 'RS256', 'secret' => '']],
            'JWT_SECRET cannot be empty, even with RS/ES.',
        ];
        yield 'unknown samesite' => [
            ['cookie' => ['samesite' => 'whatever']],
            "COOKIE_SAMESITE must be 'lax', 'none' or 'strict'",
        ];
        yield 'samesite none without secure' => [
            ['cookie' => ['samesite' => 'none', 'secure' => false]],
            'COOKIE_SAMESITE=None requires COOKIE_SECURE=true.',
        ];
        yield 'invalid cookie name' => [
            ['cookie' => ['refresh_name' => 'refresh token']],
            'REFRESH_COOKIE_NAME is invalid: use letters, digits, _ or -',
        ];
        yield 'negative access expiry' => [
            ['jwt' => ['access_expires_minutes' => -1]],
            'ACCESS_TOKEN_EXPIRES_MINUTES must be greater than zero',
        ];
        yield 'zero short refresh' => [
            ['jwt' => ['refresh_expires_short_hours' => 0]],
            'REFRESH_TOKEN_EXPIRES_SHORT_HOURS must be greater than zero',
        ];
        yield 'zero long refresh' => [
            ['jwt' => ['refresh_expires_long_days' => 0]],
            'REFRESH_TOKEN_EXPIRES_LONG_DAYS must be greater than zero',
        ];
        yield 'zero max attempts' => [['login' => ['max_attempts' => 0]], 'LOGIN_MAX_ATTEMPTS must be greater than zero'];
        yield 'zero window' => [
            ['login' => ['window_minutes' => 0]],
            'LOGIN_ATTEMPT_WINDOW_MINUTES must be greater than zero',
        ];
        yield 'zero lock' => [['login' => ['lock_minutes' => 0]], 'LOGIN_LOCK_MINUTES must be greater than zero'];
        yield 'zero reset expiry' => [
            ['password_reset' => ['expires_minutes' => 0]],
            'PASSWORD_RESET_EXPIRES_MINUTES must be greater than zero',
        ];
    }

    public function test_accepts_asymmetric_algorithms_with_a_secret(): void
    {
        PlatformEnv::validate(self::config(['jwt' => ['algorithm' => 'ES256', 'secret' => 'pem-contents']]));

        $this->expectNotToPerformAssertions();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private static function config(array $overrides = []): array
    {
        $base = [
            'env' => 'prod',
            'database_url' => 'postgresql://user:pass@postgres:5432/db',
            'jwt' => [
                'algorithm' => 'HS256',
                'secret' => str_repeat('a', 32),
                'access_expires_minutes' => 15,
                'refresh_expires_short_hours' => 8,
                'refresh_expires_long_days' => 30,
            ],
            'login' => [
                'max_attempts' => 5,
                'window_minutes' => 15,
                'lock_minutes' => 15,
            ],
            'cookie' => [
                'domain' => null,
                'secure' => true,
                'samesite' => 'lax',
                'refresh_name' => 'rt',
                'refresh_path' => '/api/v1/auth',
            ],
            'password_reset' => ['expires_minutes' => 30],
        ];

        foreach ($overrides as $key => $value) {
            $base[$key] = is_array($value) && is_array($base[$key] ?? null)
                ? [...$base[$key], ...$value]
                : $value;
        }

        return $base;
    }
}
