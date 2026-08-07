<?php

declare(strict_types=1);

namespace Tests\Regression;

use App\Models\PasswordResetToken;
use App\Payments\ChargeRequest;
use App\Payments\GatewayRegistry;
use App\Payments\MercadoPagoGateway;
use App\Payments\PaymentGateway;
use App\Services\ConsultancyService;
use App\Services\PasswordResetService;
use App\Services\PaymentService;
use App\Services\RefreshSessionService;
use App\Services\TokenService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Conditions whose alternate side no feature test happens to walk through.
 * They are cheap to get wrong and expensive to notice in production.
 */
final class BranchEdgeTest extends TestCase
{
    public function test_a_non_string_email_normalizes_to_null_instead_of_crashing(): void
    {
        $this->postJson($this->apiUrl('auth/forgot-password'), ['email' => ['not', 'a', 'string']])
            ->assertStatus(422)
            ->assertJsonPath('code', 'validation_failed');
    }

    public function test_a_preferred_gateway_that_is_not_registered_is_skipped(): void
    {
        $registry = $this->registry(['mercado_pago']);

        $this->assertSame(
            ['mercado_pago'],
            array_map(fn (PaymentGateway $g): string => $g->name(), $registry->candidates('stripe')),
        );
    }

    public function test_a_preferred_gateway_is_not_tried_twice(): void
    {
        $registry = $this->registry(['mercado_pago']);

        $this->assertCount(1, $registry->candidates('mercado_pago'));
    }

    public function test_a_charge_response_carrying_a_status_detail_keeps_it(): void
    {
        Http::fake([
            'api.mercadopago.com/preapproval' => Http::response(
                ['id' => 'mp-1', 'status' => 'authorized', 'status_detail' => 'accredited'],
                201,
            ),
        ]);

        $result = (new MercadoPagoGateway('token', 'https://example.com'))->createCharge($this->chargeRequest());

        $this->assertSame('accredited', $result->statusDetail);
    }

    public function test_an_authorized_payment_is_matched_to_its_parent_preapproval(): void
    {
        Http::fake([
            'api.mercadopago.com/authorized_payments/*' => Http::response(
                ['id' => 'auth-1', 'status' => 'approved', 'preapproval_id' => 'pre-7'],
                200,
            ),
        ]);

        $event = (new MercadoPagoGateway('token', 'https://example.com'))->parseWebhook([
            'type' => 'subscription_authorized_payment',
            'id' => 'evt-1',
            'data' => ['id' => 'auth-1'],
        ]);

        $this->assertNotNull($event);
        $this->assertSame('pre-7', $event->externalId);
    }

    public function test_a_preapproval_event_reads_the_preapproval_endpoint(): void
    {
        Http::fake([
            'api.mercadopago.com/preapproval/*' => Http::response(['id' => 'pre-1', 'status' => 'authorized'], 200),
        ]);

        $event = (new MercadoPagoGateway('token', 'https://example.com'))
            ->parseWebhook(['type' => 'preapproval', 'data' => ['id' => 'pre-1']]);

        $this->assertNotNull($event);
        Http::assertSent(fn ($request): bool => str_contains($request->url(), '/preapproval/pre-1'));
    }

    public function test_a_signature_fragment_without_an_equals_sign_is_ignored(): void
    {
        $valid = MercadoPagoGateway::verifyWebhookSignature(
            signature: 'garbage,ts=1,v1=nope',
            requestId: 'req-1',
            dataId: 'mp-1',
            secret: 'secret',
        );

        $this->assertFalse($valid);
    }

    public function test_a_required_question_answered_with_an_empty_string_counts_as_missing(): void
    {
        $question = $this->createQuestion(['label' => 'Objetivo', 'required' => true]);

        $this->expectExceptionMessage('Some required questions were left blank');

        app(ConsultancyService::class)->buildAnswerSnapshot([
            ['question_id' => $question->id, 'value' => ''],
        ]);
    }

    public function test_a_reset_token_claimed_by_a_parallel_request_is_refused(): void
    {
        $user = $this->createUser();
        $service = app(PasswordResetService::class);
        $token = $service->issueToken($user);

        // The competitor marks the token used between our SELECT and UPDATE.
        PasswordResetToken::query()->where('user_id', $user->id)->update(['used_at' => Carbon::now()]);

        $this->assertNull($service->consumeToken($token));
    }

    public function test_rotating_a_remembered_session_keeps_the_remember_claim(): void
    {
        $user = $this->createUser();
        $service = app(RefreshSessionService::class);
        $issued = $service->issue($user->id, Carbon::now()->addDays(30), remember: true);

        $payload = app(TokenService::class)->decode($issued);
        $rotated = $service->rotate((array) $payload, Carbon::now()->addDays(30));

        $this->assertNotNull($rotated);
        $this->assertSame(1, app(TokenService::class)->decode($rotated)['rm']);
    }

    /**
     * The locale is pt_BR for the reset mail, so the fallback has to be English
     * or framework strings leak out as raw keys like "validation.required".
     */
    public function test_a_validation_detail_is_an_english_sentence_not_a_translation_key(): void
    {
        $response = $this->postJson($this->apiUrl('auth/login'), [])
            ->assertStatus(422)
            ->assertJsonPath('code', 'validation_failed');

        $detail = (string) $response->json('detail');

        $this->assertStringNotContainsString('validation.', $detail);
        $this->assertStringContainsString('required', $detail);
    }

    public function test_the_reset_mail_stays_in_portuguese(): void
    {
        $this->assertSame('Recuperação de senha', __('mail.password_reset.subject'));
    }

    /**
     * This string lands on the customer's card statement, so it must stay pt-BR
     * even though every other backend message is English.
     */
    public function test_the_charge_description_reaches_the_gateway_in_portuguese(): void
    {
        Http::fake([
            'api.mercadopago.com/v1/payments' => Http::response(['id' => 'mp-1', 'status' => 'approved'], 201),
        ]);

        app(PaymentService::class)->create(
            planSlug: 'trimestral',
            mode: 'cash',
            payerEmail: 'aluno@example.com',
            cardToken: 'card-token',
            paymentMethodId: null,
        );

        Http::assertSent(fn ($request): bool => $request->data()['description'] === 'Plano Trimestral - à vista');
    }

    public function test_a_subscription_description_spells_out_the_instalments(): void
    {
        Http::fake([
            'api.mercadopago.com/preapproval' => Http::response(['id' => 'mp-2', 'status' => 'authorized'], 201),
        ]);

        app(PaymentService::class)->create(
            planSlug: 'semestral',
            mode: 'subscription',
            payerEmail: 'aluno@example.com',
            cardToken: 'card-token',
            paymentMethodId: null,
        );

        Http::assertSent(fn ($request): bool => $request->data()['reason'] === 'Plano Semestral - 6 cobranças mensais');
    }

    /**
     * @param  list<string>  $order
     */
    private function registry(array $order): GatewayRegistry
    {
        return new GatewayRegistry([new MercadoPagoGateway('token', 'https://example.com')], $order);
    }

    private function chargeRequest(): ChargeRequest
    {
        return new ChargeRequest(
            reference: 'payment:abc',
            description: 'Plano Trimestral',
            amount: '212.66',
            payerEmail: 'aluno@example.com',
            cardToken: 'card-token',
            paymentMethodId: null,
            mode: 'subscription',
            installments: 3,
        );
    }
}
