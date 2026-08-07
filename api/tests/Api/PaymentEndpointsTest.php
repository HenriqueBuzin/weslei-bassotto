<?php

declare(strict_types=1);

namespace Tests\Api;

use App\Models\AdminEvent;
use App\Models\Payment;
use App\Models\PaymentAttempt;
use App\Payments\GatewayRegistry;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class PaymentEndpointsTest extends TestCase
{
    public function test_a_cash_charge_stores_the_gateway_reference(): void
    {
        Http::fake([
            'api.mercadopago.com/v1/payments' => Http::response(['id' => 'mp-1', 'status' => 'approved'], 201),
        ]);

        $user = $this->createUser();

        $response = $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl('payments/card-subscription'), $this->chargePayload(['payment_mode' => 'cash']))
            ->assertOk()
            ->assertJsonPath('gateway', 'mercado_pago')
            ->assertJsonPath('external_id', 'mp-1')
            ->assertJsonPath('status', 'approved');

        $payment = Payment::query()->firstOrFail();
        $this->assertSame('597.00', $payment->amount);
        $this->assertSame('cash', $payment->mode);
        $this->assertNotEmpty($response->json('payment_token'));
        $this->assertSame(1, PaymentAttempt::query()->count());
    }

    public function test_a_subscription_charge_bills_only_the_monthly_installment(): void
    {
        Http::fake([
            'api.mercadopago.com/preapproval' => Http::response(['id' => 'mp-sub-1', 'status' => 'authorized'], 201),
        ]);

        $this->withHeaders($this->authHeader($this->createUser()))
            ->postJson($this->apiUrl('payments/card-subscription'), $this->chargePayload(['plan_slug' => 'anual']))
            ->assertOk()
            ->assertJsonPath('status', 'approved');

        $payment = Payment::query()->firstOrFail();
        $this->assertSame('155.25', $payment->amount);
        $this->assertSame('subscription', $payment->mode);
    }

    public function test_the_subscription_request_asks_for_monthly_recurrence(): void
    {
        Http::fake([
            'api.mercadopago.com/preapproval' => Http::response(['id' => 'mp-sub-2', 'status' => 'authorized'], 201),
        ]);

        $this->withHeaders($this->authHeader($this->createUser()))
            ->postJson($this->apiUrl('payments/card-subscription'), $this->chargePayload(['plan_slug' => 'semestral']))
            ->assertOk();

        Http::assertSent(function ($request): bool {
            $body = $request->data();

            return $body['auto_recurring']['frequency'] === 1
                && $body['auto_recurring']['frequency_type'] === 'months'
                && $body['auto_recurring']['transaction_amount'] === 182.23
                && $body['auto_recurring']['currency_id'] === 'BRL'
                && $body['status'] === 'authorized';
        });
    }

    public function test_a_cash_request_sends_an_idempotency_key(): void
    {
        Http::fake([
            'api.mercadopago.com/v1/payments' => Http::response(['id' => 'mp-2', 'status' => 'approved'], 201),
        ]);

        $this->withHeaders($this->authHeader($this->createUser()))
            ->postJson($this->apiUrl('payments/card-subscription'), $this->chargePayload([
                'payment_mode' => 'cash',
                'payment_method_id' => 'visa',
            ]))
            ->assertOk();

        $payment = Payment::query()->firstOrFail();

        Http::assertSent(fn ($request): bool => $request->hasHeader('X-Idempotency-Key', "payment:{$payment->id}")
            && $request->data()['payment_method_id'] === 'visa'
            && $request->data()['installments'] === 1);
    }

    public function test_a_rejected_charge_fails_the_payment_and_alerts_the_admin(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['message' => 'cc_rejected'], 400),
        ]);

        $this->withHeaders($this->authHeader($this->createUser()))
            ->postJson($this->apiUrl('payments/card-subscription'), $this->chargePayload())
            ->assertStatus(502);

        $payment = Payment::query()->firstOrFail();
        $this->assertSame('failed', $payment->status);
        $this->assertStringContainsString('Mercado Pago rejected the operation (400)', (string) $payment->status_detail);
        $this->assertSame('rejected', PaymentAttempt::query()->firstOrFail()->status);
        $this->assertSame(1, AdminEvent::query()->where('type', 'payment_failed')->count());
    }

    public function test_a_rejected_charge_is_never_retried_on_another_gateway(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['message' => 'cc_rejected'], 402),
        ]);

        $this->withHeaders($this->authHeader($this->createUser()))
            ->postJson($this->apiUrl('payments/card-subscription'), $this->chargePayload())
            ->assertStatus(502);

        Http::assertSentCount(1);
    }

    public function test_a_missing_access_token_makes_the_gateway_unavailable(): void
    {
        config(['platform.payments.mercado_pago.access_token' => '']);
        // The registry is a singleton built from config, so drop it to rebuild.
        $this->app->forgetInstance(GatewayRegistry::class);

        $this->withHeaders($this->authHeader($this->createUser()))
            ->postJson($this->apiUrl('payments/card-subscription'), $this->chargePayload())
            ->assertStatus(502)
            ->assertJsonPath('code', 'payment_gateway_error');

        $payment = Payment::query()->firstOrFail();
        $this->assertSame('failed', $payment->status);
        $this->assertStringContainsString('MERCADO_PAGO_ACCESS_TOKEN is not configured', (string) $payment->status_detail);
        $this->assertSame('unavailable', PaymentAttempt::query()->firstOrFail()->status);
    }

    public function test_a_pending_charge_does_not_raise_an_alert(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-3', 'status' => 'in_process'], 201),
        ]);

        $this->withHeaders($this->authHeader($this->createUser()))
            ->postJson($this->apiUrl('payments/card-subscription'), $this->chargePayload())
            ->assertOk()
            ->assertJsonPath('status', 'pending');

        $this->assertSame(0, AdminEvent::query()->count());
    }

    public function test_a_gateway_reported_failure_raises_an_alert(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-4', 'status' => 'rejected'], 201),
        ]);

        $this->withHeaders($this->authHeader($this->createUser()))
            ->postJson($this->apiUrl('payments/card-subscription'), $this->chargePayload())
            ->assertOk()
            ->assertJsonPath('status', 'failed');

        $this->assertSame(1, AdminEvent::query()->where('type', 'payment_failed')->count());
    }

    public function test_charging_requires_authentication(): void
    {
        $this->postJson($this->apiUrl('payments/card-subscription'), $this->chargePayload())->assertStatus(401);
    }

    public function test_charging_validates_the_plan_and_mode(): void
    {
        $headers = $this->authHeader($this->createUser());

        $this->withHeaders($headers)
            ->postJson($this->apiUrl('payments/card-subscription'), $this->chargePayload(['plan_slug' => 'mensal']))
            ->assertStatus(422);

        $this->withHeaders($headers)
            ->postJson($this->apiUrl('payments/card-subscription'), $this->chargePayload(['payment_mode' => 'pix']))
            ->assertStatus(422);
    }

    public function test_the_payment_status_is_readable_with_the_claim_token(): void
    {
        [$payment, $claimToken] = $this->createApprovedPayment(['status_detail' => 'accredited']);

        $this->getJson($this->apiUrl("payments/{$payment->id}/status?token={$claimToken}"))
            ->assertOk()
            ->assertExactJson([
                'id' => $payment->id,
                'status' => 'approved',
                'status_detail' => 'accredited',
            ]);
    }

    public function test_the_payment_status_hides_behind_the_claim_token(): void
    {
        [$payment] = $this->createApprovedPayment();

        $this->getJson($this->apiUrl("payments/{$payment->id}/status?token=errado"))
            ->assertStatus(404)
            ->assertJsonPath('code', 'payment_not_found');
    }

    public function test_the_payment_status_requires_a_token(): void
    {
        [$payment] = $this->createApprovedPayment();

        $this->getJson($this->apiUrl("payments/{$payment->id}/status"))->assertStatus(404);
    }

    public function test_the_payment_status_rejects_a_malformed_id(): void
    {
        $this->getJson($this->apiUrl('payments/nao-e-id/status?token=qualquer'))->assertStatus(404);
    }

    public function test_a_renewal_charges_the_contract_owner(): void
    {
        Http::fake([
            'api.mercadopago.com/preapproval' => Http::response(['id' => 'mp-ren-1', 'status' => 'pending'], 201),
        ]);

        $user = $this->createUser('aluno@example.com');
        $submission = $this->createSubmission(['customer_email' => 'aluno@example.com']);

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl("payments/me/renewals/{$submission->id}"), $this->chargePayload())
            ->assertOk()
            ->assertJsonPath('external_id', 'mp-ren-1');

        $this->assertSame($submission->id, Payment::query()->firstOrFail()->renewal_submission_id);
    }

    public function test_a_renewal_for_someone_elses_contract_is_forbidden(): void
    {
        $user = $this->createUser('aluno@example.com');
        $submission = $this->createSubmission(['customer_email' => 'outro@example.com']);

        $this->withHeaders($this->authHeader($user))
            ->postJson($this->apiUrl("payments/me/renewals/{$submission->id}"), $this->chargePayload())
            ->assertStatus(403)
            ->assertJsonPath('code', 'submission_not_owned');
    }

    public function test_a_renewal_for_a_missing_contract_returns_not_found(): void
    {
        $this->withHeaders($this->authHeader($this->createUser()))
            ->postJson($this->apiUrl('payments/me/renewals/'.str_repeat('a', 24)), $this->chargePayload())
            ->assertStatus(404)
            ->assertJsonPath('code', 'submission_not_found');
    }

    public function test_a_renewal_with_a_malformed_id_is_rejected(): void
    {
        $this->withHeaders($this->authHeader($this->createUser()))
            ->postJson($this->apiUrl('payments/me/renewals/nao-e-id'), $this->chargePayload())
            ->assertStatus(400)
            ->assertJsonPath('code', 'invalid_id');
    }

    public function test_a_renewal_requires_authentication(): void
    {
        $submission = $this->createSubmission();

        $this->postJson($this->apiUrl("payments/me/renewals/{$submission->id}"), $this->chargePayload())
            ->assertStatus(401);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function chargePayload(array $overrides = []): array
    {
        return [
            'plan_slug' => 'trimestral',
            'payer_email' => 'aluno@example.com',
            'card_token_id' => 'card-token-1',
            'payment_mode' => 'subscription',
            ...$overrides,
        ];
    }
}
