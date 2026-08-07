<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Payments\MercadoPagoGateway;
use PHPUnit\Framework\TestCase;

final class MercadoPagoSignatureTest extends TestCase
{
    private const SECRET = 'webhook-secret';

    public function test_accepts_a_correctly_signed_notification(): void
    {
        $this->assertTrue(MercadoPagoGateway::verifyWebhookSignature(
            signature: $this->signature('1700000000', 'payment-123', 'req-1'),
            requestId: 'req-1',
            dataId: 'payment-123',
            secret: self::SECRET,
        ));
    }

    public function test_data_id_is_compared_case_insensitively(): void
    {
        $this->assertTrue(MercadoPagoGateway::verifyWebhookSignature(
            signature: $this->signature('1700000000', 'payment-abc', 'req-1'),
            requestId: 'req-1',
            dataId: 'PAYMENT-ABC',
            secret: self::SECRET,
        ));
    }

    public function test_tolerates_padding_around_the_signature_parts(): void
    {
        $expected = hash_hmac(
            'sha256',
            'id:payment-123;request-id:req-1;ts:1700000000;',
            self::SECRET
        );

        $this->assertTrue(MercadoPagoGateway::verifyWebhookSignature(
            signature: " ts = 1700000000 , v1 = {$expected} ",
            requestId: 'req-1',
            dataId: 'payment-123',
            secret: self::SECRET,
        ));
    }

    public function test_rejects_a_tampered_signature(): void
    {
        $this->assertFalse(MercadoPagoGateway::verifyWebhookSignature(
            signature: 'ts=1700000000,v1='.str_repeat('0', 64),
            requestId: 'req-1',
            dataId: 'payment-123',
            secret: self::SECRET,
        ));
    }

    public function test_rejects_a_signature_computed_for_another_payment(): void
    {
        $this->assertFalse(MercadoPagoGateway::verifyWebhookSignature(
            signature: $this->signature('1700000000', 'payment-999', 'req-1'),
            requestId: 'req-1',
            dataId: 'payment-123',
            secret: self::SECRET,
        ));
    }

    public function test_rejects_a_signature_computed_for_another_request(): void
    {
        $this->assertFalse(MercadoPagoGateway::verifyWebhookSignature(
            signature: $this->signature('1700000000', 'payment-123', 'req-other'),
            requestId: 'req-1',
            dataId: 'payment-123',
            secret: self::SECRET,
        ));
    }

    public function test_rejects_a_signature_missing_the_timestamp(): void
    {
        $this->assertFalse(MercadoPagoGateway::verifyWebhookSignature(
            signature: 'v1='.str_repeat('a', 64),
            requestId: 'req-1',
            dataId: 'payment-123',
            secret: self::SECRET,
        ));
    }

    public function test_rejects_a_signature_missing_the_hash(): void
    {
        $this->assertFalse(MercadoPagoGateway::verifyWebhookSignature(
            signature: 'ts=1700000000',
            requestId: 'req-1',
            dataId: 'payment-123',
            secret: self::SECRET,
        ));
    }

    public function test_rejects_a_malformed_signature_header(): void
    {
        $this->assertFalse(MercadoPagoGateway::verifyWebhookSignature(
            signature: 'garbage-without-separators',
            requestId: 'req-1',
            dataId: 'payment-123',
            secret: self::SECRET,
        ));
    }

    public function test_rejects_an_empty_request_id(): void
    {
        $this->assertFalse(MercadoPagoGateway::verifyWebhookSignature(
            signature: $this->signature('1700000000', 'payment-123', ''),
            requestId: '',
            dataId: 'payment-123',
            secret: self::SECRET,
        ));
    }

    public function test_rejects_an_empty_data_id(): void
    {
        $this->assertFalse(MercadoPagoGateway::verifyWebhookSignature(
            signature: $this->signature('1700000000', '', 'req-1'),
            requestId: 'req-1',
            dataId: '',
            secret: self::SECRET,
        ));
    }

    public function test_rejects_verification_when_no_secret_is_configured(): void
    {
        $this->assertFalse(MercadoPagoGateway::verifyWebhookSignature(
            signature: $this->signature('1700000000', 'payment-123', 'req-1'),
            requestId: 'req-1',
            dataId: 'payment-123',
            secret: '',
        ));
    }

    private function signature(string $timestamp, string $dataId, string $requestId): string
    {
        $manifest = 'id:'.strtolower($dataId).";request-id:{$requestId};ts:{$timestamp};";

        return "ts={$timestamp},v1=".hash_hmac('sha256', $manifest, self::SECRET);
    }
}
