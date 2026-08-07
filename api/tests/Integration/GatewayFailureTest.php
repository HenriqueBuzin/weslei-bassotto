<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Models\Payment;
use App\Models\PaymentAttempt;
use App\Payments\ChargeRequest;
use App\Payments\GatewayException;
use App\Payments\GatewayUnavailable;
use App\Payments\MercadoPagoGateway;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class GatewayFailureTest extends TestCase
{
    public function test_a_network_timeout_leaves_the_gateway_available_for_fallback(): void
    {
        Http::fake(fn () => throw new ConnectionException('cURL error 28: Operation timed out'));

        $this->withHeaders($this->authHeader($this->createUser()))
            ->postJson($this->apiUrl('payments/card-subscription'), [
                'plan_slug' => 'trimestral',
                'payer_email' => 'aluno@example.com',
                'card_token_id' => 'card-token',
            ])
            ->assertStatus(502)
            ->assertJsonPath('code', 'payment_gateway_error');

        $this->assertSame('failed', Payment::query()->firstOrFail()->status);
        $this->assertStringContainsString(
            'Mercado Pago is unreachable',
            (string) PaymentAttempt::query()->firstOrFail()->detail,
        );
    }

    public function test_a_timeout_while_reading_a_webhook_is_reported_as_unavailable(): void
    {
        Http::fake(fn () => throw new ConnectionException('cURL error 28'));

        $gateway = new MercadoPagoGateway('token', 'https://example.com');

        $this->expectException(GatewayUnavailable::class);

        $gateway->parseWebhook(['type' => 'payment', 'data' => ['id' => 'mp-1']]);
    }

    public function test_a_gateway_without_a_token_refuses_before_calling_out(): void
    {
        Http::fake();

        $gateway = new MercadoPagoGateway('', 'https://example.com');

        $this->expectException(GatewayUnavailable::class);
        $this->expectExceptionMessage('MERCADO_PAGO_ACCESS_TOKEN is not configured');

        $gateway->createCharge($this->chargeRequest());
    }

    public function test_a_preapproval_lookup_failure_is_reported(): void
    {
        Http::fake([
            'api.mercadopago.com/preapproval/*' => Http::response(['message' => 'boom'], 500),
        ]);

        $gateway = new MercadoPagoGateway('token', 'https://example.com');

        $this->expectException(GatewayException::class);
        $this->expectExceptionMessage('Could not read the payment (500)');

        $gateway->parseWebhook(['type' => 'preapproval', 'data' => ['id' => 'mp-1']]);
    }

    public function test_a_webhook_without_a_recognised_topic_is_ignored(): void
    {
        Http::fake();

        $gateway = new MercadoPagoGateway('token', 'https://example.com');

        $this->assertNull($gateway->parseWebhook(['type' => 'plan', 'data' => ['id' => 'mp-1']]));
        $this->assertNull($gateway->parseWebhook(['type' => 'payment']));
        $this->assertNull($gateway->parseWebhook([]));
    }

    public function test_an_authorized_payment_without_a_parent_falls_back_to_its_own_id(): void
    {
        Http::fake([
            'api.mercadopago.com/authorized_payments/*' => Http::response(['id' => 'auth-9', 'status' => 'approved'], 200),
        ]);

        $gateway = new MercadoPagoGateway('token', 'https://example.com');

        $event = $gateway->parseWebhook([
            'type' => 'subscription_authorized_payment',
            'id' => 'evt-9',
            'data' => ['id' => 'auth-9'],
        ]);

        $this->assertNotNull($event);
        $this->assertSame('auth-9', $event->externalId);
    }

    public function test_the_gateway_exposes_its_registry_name(): void
    {
        $this->assertSame('mercado_pago', (new MercadoPagoGateway('token', 'https://example.com'))->name());
    }

    public function test_a_trailing_slash_in_the_public_url_is_normalised_in_the_back_url(): void
    {
        Http::fake([
            'api.mercadopago.com/preapproval' => Http::response(['id' => 'mp-1', 'status' => 'authorized'], 201),
        ]);

        (new MercadoPagoGateway('token', 'https://example.com/'))->createCharge($this->chargeRequest());

        Http::assertSent(fn ($request): bool => $request->data()['back_url'] === 'https://example.com/pagamento/retorno');
    }

    public function test_a_charge_without_a_payment_method_omits_the_field(): void
    {
        Http::fake([
            'api.mercadopago.com/preapproval' => Http::response(['id' => 'mp-1', 'status' => 'authorized'], 201),
        ]);

        (new MercadoPagoGateway('token', 'https://example.com'))->createCharge($this->chargeRequest());

        Http::assertSent(fn ($request): bool => ! array_key_exists('payment_method_id', $request->data()));
    }

    public function test_a_subscription_charge_may_carry_a_payment_method(): void
    {
        Http::fake([
            'api.mercadopago.com/preapproval' => Http::response(['id' => 'mp-1', 'status' => 'authorized'], 201),
        ]);

        (new MercadoPagoGateway('token', 'https://example.com'))
            ->createCharge($this->chargeRequest(paymentMethodId: 'master'));

        Http::assertSent(fn ($request): bool => $request->data()['payment_method_id'] === 'master');
    }

    public function test_a_cash_charge_without_a_payment_method_omits_the_field(): void
    {
        Http::fake([
            'api.mercadopago.com/v1/payments' => Http::response(['id' => 'mp-1', 'status' => 'approved'], 201),
        ]);

        (new MercadoPagoGateway('token', 'https://example.com'))->createCharge($this->chargeRequest(mode: 'cash'));

        Http::assertSent(fn ($request): bool => ! array_key_exists('payment_method_id', $request->data()));
    }

    public function test_a_charge_response_without_a_status_detail_stores_null(): void
    {
        Http::fake([
            'api.mercadopago.com/preapproval' => Http::response(['id' => 'mp-1', 'status' => 'authorized'], 201),
        ]);

        $result = (new MercadoPagoGateway('token', 'https://example.com'))->createCharge($this->chargeRequest());

        $this->assertNull($result->statusDetail);
        $this->assertSame('mp-1', $result->externalId);
    }

    private function chargeRequest(string $mode = 'subscription', ?string $paymentMethodId = null): ChargeRequest
    {
        return new ChargeRequest(
            reference: 'payment:abc',
            description: 'Plano Trimestral',
            amount: '212.66',
            payerEmail: 'aluno@example.com',
            cardToken: 'card-token',
            paymentMethodId: $paymentMethodId,
            mode: $mode,
            installments: $mode === 'cash' ? 1 : 3,
        );
    }
}
