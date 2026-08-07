<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\EnvSecrets;
use PHPUnit\Framework\TestCase;

final class EnvSecretsTest extends TestCase
{
    /** @var list<string> */
    private array $files = [];

    /** @var array<string, array{env: mixed, server: mixed}> */
    private array $snapshot = [];

    /**
     * phpunit.xml seeds several of these variables, so the original values are
     * restored instead of unset: wiping them would leak into every later test.
     */
    protected function setUp(): void
    {
        parent::setUp();

        foreach ($this->trackedNames() as $name) {
            $this->snapshot[$name] = [
                'env' => $_ENV[$name] ?? null,
                'server' => $_SERVER[$name] ?? null,
            ];
        }
    }

    protected function tearDown(): void
    {
        foreach ($this->files as $file) {
            @unlink($file);
        }

        foreach ($this->trackedNames() as $name) {
            $original = $this->snapshot[$name];

            $this->restore($name, $original['env'], $original['server']);
        }

        parent::tearDown();
    }

    public function test_publishes_a_secret_read_from_its_file(): void
    {
        $_SERVER['JWT_SECRET_FILE'] = $this->writeSecret("super-secret-value\n");

        EnvSecrets::hydrate();

        $this->assertSame('super-secret-value', $_ENV['JWT_SECRET']);
        $this->assertSame('super-secret-value', $_SERVER['JWT_SECRET']);
        $this->assertSame('super-secret-value', getenv('JWT_SECRET'));
    }

    public function test_strips_only_trailing_newlines(): void
    {
        $_SERVER['APP_KEY_FILE'] = $this->writeSecret("  base64:key  \r\n");

        EnvSecrets::hydrate();

        $this->assertSame('  base64:key  ', $_ENV['APP_KEY']);
    }

    public function test_ignores_a_secret_whose_file_is_missing(): void
    {
        $_SERVER['SMTP_PASSWORD_FILE'] = sys_get_temp_dir().'/does-not-exist-'.bin2hex(random_bytes(4));

        EnvSecrets::hydrate();

        $this->assertSecretUnchanged('SMTP_PASSWORD');
    }

    public function test_ignores_an_empty_secret_file(): void
    {
        $_SERVER['MERCADO_PAGO_ACCESS_TOKEN_FILE'] = $this->writeSecret("\n");

        EnvSecrets::hydrate();

        $this->assertSecretUnchanged('MERCADO_PAGO_ACCESS_TOKEN');
    }

    public function test_ignores_a_blank_file_path(): void
    {
        $_SERVER['DATABASE_URL_FILE'] = '';

        EnvSecrets::hydrate();

        $this->assertSecretUnchanged('DATABASE_URL');
    }

    public function test_ignores_a_non_string_file_path(): void
    {
        $_SERVER['DATABASE_URL_FILE'] = ['not', 'a', 'path'];

        EnvSecrets::hydrate();

        $this->assertSecretUnchanged('DATABASE_URL');
    }

    public function test_reads_the_path_from_the_env_superglobal_too(): void
    {
        $_ENV['MERCADO_PAGO_WEBHOOK_SECRET_FILE'] = $this->writeSecret('hmac-secret');

        EnvSecrets::hydrate();

        $this->assertSame('hmac-secret', $_ENV['MERCADO_PAGO_WEBHOOK_SECRET']);
    }

    /**
     * A file can vanish or lose its permissions between the is_file() check and
     * the read; a stream wrapper reproduces that without needing chmod.
     */
    public function test_ignores_a_secret_file_it_cannot_read(): void
    {
        UnreadableStream::register();
        $_SERVER['SMTP_PASSWORD_FILE'] = UnreadableStream::PROTOCOL.'://secret';

        EnvSecrets::hydrate();

        $this->assertSecretUnchanged('SMTP_PASSWORD');
    }

    public function test_does_nothing_when_no_secret_files_are_declared(): void
    {
        EnvSecrets::hydrate();

        foreach (EnvSecrets::NAMES as $name) {
            $this->assertSecretUnchanged($name);
        }
    }

    /** Asserts hydrate() left the variable exactly as the test bootstrap set it. */
    private function assertSecretUnchanged(string $name): void
    {
        $this->assertSame($this->snapshot[$name]['env'] ?? null, $_ENV[$name] ?? null);
    }

    /**
     * @return list<string>
     */
    private function trackedNames(): array
    {
        $names = [];

        foreach (EnvSecrets::NAMES as $name) {
            $names[] = $name;
            $names[] = $name.'_FILE';
        }

        return $names;
    }

    private function restore(string $name, mixed $env, mixed $server): void
    {
        if ($env === null) {
            unset($_ENV[$name]);
        } else {
            $_ENV[$name] = $env;
        }

        if ($server === null) {
            unset($_SERVER[$name]);
        } else {
            $_SERVER[$name] = $server;
        }

        is_string($server ?? $env) ? putenv($name.'='.($server ?? $env)) : putenv($name);
    }

    private function writeSecret(string $contents): string
    {
        $path = sys_get_temp_dir().'/secret-'.bin2hex(random_bytes(6));
        file_put_contents($path, $contents);
        $this->files[] = $path;

        return $path;
    }
}
