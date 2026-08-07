<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\RefreshSessionService;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * A refresh payload reaches here already decoded, but its claims are still
 * attacker controlled: a malformed one must fail closed instead of querying.
 */
final class RefreshSessionServiceTest extends TestCase
{
    public function test_identity_reads_the_subject_and_hashes_the_jti(): void
    {
        $service = app(RefreshSessionService::class);
        $userId = str_repeat('a', 24);

        $this->assertSame(
            [$userId, RefreshSessionService::hashJti('jti-1')],
            $service->identity(['sub' => $userId, 'jti' => 'jti-1']),
        );
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    #[DataProvider('malformedPayloadProvider')]
    public function test_identity_refuses_a_malformed_payload(array $payload): void
    {
        $this->assertNull(app(RefreshSessionService::class)->identity($payload));
    }

    /**
     * @return iterable<string, array{0: array<string, mixed>}>
     */
    public static function malformedPayloadProvider(): iterable
    {
        $id = str_repeat('a', 24);

        yield 'no subject' => [['jti' => 'jti-1']];
        yield 'malformed subject' => [['sub' => 'nope', 'jti' => 'jti-1']];
        yield 'no jti' => [['sub' => $id]];
        yield 'empty jti' => [['sub' => $id, 'jti' => '']];
        yield 'non string jti' => [['sub' => $id, 'jti' => 42]];
    }

    public function test_rotating_a_malformed_payload_issues_nothing(): void
    {
        $rotated = app(RefreshSessionService::class)->rotate(['jti' => 'orphan'], Carbon::now()->addHour());

        $this->assertNull($rotated);
    }

    public function test_revoking_a_malformed_payload_reports_no_session_removed(): void
    {
        $this->assertFalse(app(RefreshSessionService::class)->revoke(['jti' => 'orphan']));
    }
}
