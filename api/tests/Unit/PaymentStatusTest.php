<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Payments\PaymentStatus;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class PaymentStatusTest extends TestCase
{
    #[DataProvider('gatewayStatusProvider')]
    public function test_maps_gateway_statuses(?string $raw, PaymentStatus $expected): void
    {
        $this->assertSame($expected, PaymentStatus::fromGateway($raw));
    }

    /**
     * @return iterable<string, array{0: string|null, 1: PaymentStatus}>
     */
    public static function gatewayStatusProvider(): iterable
    {
        yield 'approved' => ['approved', PaymentStatus::Approved];
        yield 'authorized subscription' => ['authorized', PaymentStatus::Approved];
        yield 'active subscription' => ['active', PaymentStatus::Approved];
        yield 'uppercase approved' => ['APPROVED', PaymentStatus::Approved];
        yield 'cancelled british' => ['cancelled', PaymentStatus::Cancelled];
        yield 'canceled american' => ['canceled', PaymentStatus::Cancelled];
        yield 'rejected' => ['rejected', PaymentStatus::Failed];
        yield 'paused' => ['paused', PaymentStatus::Failed];
        yield 'expired' => ['expired', PaymentStatus::Failed];
        yield 'in process stays pending' => ['in_process', PaymentStatus::Pending];
        yield 'unknown stays pending' => ['whatever', PaymentStatus::Pending];
        yield 'empty stays pending' => ['', PaymentStatus::Pending];
        yield 'null stays pending' => [null, PaymentStatus::Pending];
    }

    public function test_exposes_the_stored_values(): void
    {
        $this->assertSame('pending', PaymentStatus::Pending->value);
        $this->assertSame('approved', PaymentStatus::Approved->value);
        $this->assertSame('failed', PaymentStatus::Failed->value);
        $this->assertSame('cancelled', PaymentStatus::Cancelled->value);
    }
}
