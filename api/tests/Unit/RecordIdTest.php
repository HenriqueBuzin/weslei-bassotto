<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\RecordId;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class RecordIdTest extends TestCase
{
    public function test_generates_a_lowercase_24_character_hex_id(): void
    {
        $id = RecordId::generate();

        $this->assertSame(24, strlen($id));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{24}$/', $id);
    }

    public function test_generated_ids_do_not_repeat(): void
    {
        $ids = array_map(fn (): string => RecordId::generate(), range(1, 50));

        $this->assertCount(50, array_unique($ids));
    }

    #[DataProvider('validityProvider')]
    public function test_validates_candidates(mixed $candidate, bool $expected): void
    {
        $this->assertSame($expected, RecordId::isValid($candidate));
    }

    /**
     * @return iterable<string, array{0: mixed, 1: bool}>
     */
    public static function validityProvider(): iterable
    {
        yield 'lowercase hex' => ['0123456789abcdef01234567', true];
        yield 'uppercase hex' => ['0123456789ABCDEF01234567', true];
        yield 'too short' => ['0123456789abcdef0123456', false];
        yield 'too long' => ['0123456789abcdef012345678', false];
        yield 'non hex character' => ['0123456789abcdefg1234567', false];
        yield 'empty string' => ['', false];
        yield 'null' => [null, false];
        yield 'integer' => [123456789012345678901234, false];
        yield 'array' => [[], false];
    }

    public function test_normalizes_valid_ids_to_lowercase(): void
    {
        $this->assertSame('0123456789abcdef01234567', RecordId::normalize('0123456789ABCDEF01234567'));
    }

    public function test_normalizing_an_invalid_id_returns_null(): void
    {
        $this->assertNull(RecordId::normalize('not-an-id'));
        $this->assertNull(RecordId::normalize(null));
    }
}
