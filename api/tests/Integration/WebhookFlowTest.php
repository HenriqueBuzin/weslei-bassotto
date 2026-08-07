<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Domain\PlanCatalog;
use App\Models\AdminEvent;
use App\Models\ContractEvent;
use App\Models\Payment;
use App\Models\PaymentWebhookEvent;
use App\Models\SubmissionRenewal;
use App\Payments\PaymentStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

final class WebhookFlowTest extends TestCase
{
    private const SECRET = 'test-webhook-secret';

    public function test_an_unsigned_notification_is_rejected(): void
    {
        $this->postJson($this->apiUrl('payments/webhooks/mercado_pago'), $this->notification('mp-1'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'webhook_signature_invalid');
    }

    public function test_a_wrongly_signed_notification_is_rejected(): void
    {
        $this->withHeaders([
            'x-signature' => 'ts=1700000000,v1='.str_repeat('0', 64),
            'x-request-id' => 'req-1',
        ])
            ->postJson($this->apiUrl('payments/webhooks/mercado_pago'), $this->notification('mp-1'))
            ->assertStatus(401);
    }

    public function test_an_approved_notification_renews_the_contract_once(): void
    {
        Http::fake([
            'api.mercadopago.com/preapproval/mp-sub-1' => Http::response(
                ['id' => 'mp-sub-1', 'status' => 'authorized', 'status_detail' => 'accredited'],
                200,
            ),
        ]);

        $currentEnd = Carbon::now()->addMonth()->startOfDay();
        $submission = $this->createSubmission(['plan_end_date' => $currentEnd, 'renewal_count' => 0]);
        [$payment] = $this->createApprovedPayment([
            'status' => PaymentStatus::Pending->value,
            'external_id' => 'mp-sub-1',
            'renewal_submission_id' => $submission->id,
            'plan_slug' => 'semestral',
        ]);

        $this->sendSigned('mp-sub-1', ['type' => 'preapproval', 'id' => 'evt-1', 'data' => ['id' => 'mp-sub-1']])
            ->assertOk()
            ->assertExactJson(['ok' => true, 'processed' => true]);

        $submission->refresh();
        $this->assertSame(1, $submission->renewal_count);
        $this->assertSame('semestral', $submission->plan_slug);
        $this->assertSame($currentEnd->toDateString(), $submission->plan_start_date->toDateString());
        $this->assertSame(
            PlanCatalog::addMonths($currentEnd, 6)->toDateString(),
            $submission->plan_end_date->toDateString(),
        );
        $this->assertSame('active', $submission->status);
        $this->assertNull($submission->recurrence_issue);
        $this->assertSame('approved', $payment->refresh()->status);
        $this->assertNotNull($payment->contract_activated_at);
        $this->assertSame(1, SubmissionRenewal::query()->count());
        $this->assertSame(1, ContractEvent::query()->where('type', 'contract_activated')->count());
        $this->assertSame(1, AdminEvent::query()->where('type', 'renewal_approved')->count());
    }

    public function test_replaying_the_same_event_id_is_ignored(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-sub-2', 'status' => 'authorized'], 200),
        ]);

        $submission = $this->createSubmission();
        $this->createApprovedPayment([
            'status' => PaymentStatus::Pending->value,
            'external_id' => 'mp-sub-2',
            'renewal_submission_id' => $submission->id,
        ]);

        $payload = ['type' => 'preapproval', 'id' => 'evt-dup', 'data' => ['id' => 'mp-sub-2']];

        $this->sendSigned('mp-sub-2', $payload)->assertOk()->assertJsonPath('processed', true);
        $this->sendSigned('mp-sub-2', $payload)->assertOk()->assertJsonPath('processed', false);

        $this->assertSame(1, $submission->refresh()->renewal_count);
        $this->assertSame(1, PaymentWebhookEvent::query()->count());
    }

    public function test_a_second_approval_with_a_new_event_id_does_not_renew_twice(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-sub-3', 'status' => 'authorized'], 200),
        ]);

        $submission = $this->createSubmission();
        $this->createApprovedPayment([
            'status' => PaymentStatus::Pending->value,
            'external_id' => 'mp-sub-3',
            'renewal_submission_id' => $submission->id,
        ]);

        $this->sendSigned('mp-sub-3', ['type' => 'preapproval', 'id' => 'evt-a', 'data' => ['id' => 'mp-sub-3']])
            ->assertOk();
        $this->sendSigned('mp-sub-3', ['type' => 'preapproval', 'id' => 'evt-b', 'data' => ['id' => 'mp-sub-3']])
            ->assertOk();

        $this->assertSame(1, $submission->refresh()->renewal_count);
        $this->assertSame(1, SubmissionRenewal::query()->count());
    }

    public function test_a_notification_for_an_unknown_payment_is_recorded_but_not_processed(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-ghost', 'status' => 'approved'], 200),
        ]);

        $this->sendSigned('mp-ghost', ['type' => 'payment', 'id' => 'evt-ghost', 'data' => ['id' => 'mp-ghost']])
            ->assertOk()
            ->assertJsonPath('processed', false);

        $this->assertFalse(PaymentWebhookEvent::query()->firstOrFail()->matched);
    }

    public function test_a_failed_notification_flags_the_recurrence_and_alerts_the_admin(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(
                ['id' => 'mp-sub-4', 'status' => 'rejected', 'status_detail' => 'cc_rejected_insufficient_amount'],
                200,
            ),
        ]);

        $submission = $this->createSubmission();
        $this->createApprovedPayment([
            'status' => PaymentStatus::Pending->value,
            'external_id' => 'mp-sub-4',
            'renewal_submission_id' => $submission->id,
        ]);

        $this->sendSigned('mp-sub-4', ['type' => 'preapproval', 'id' => 'evt-fail', 'data' => ['id' => 'mp-sub-4']])
            ->assertOk()
            ->assertJsonPath('processed', true);

        $submission->refresh();
        $this->assertSame('failed', $submission->recurrence_status);
        $this->assertSame('cc_rejected_insufficient_amount', $submission->recurrence_issue);
        $this->assertSame(0, $submission->renewal_count);
        $this->assertSame(1, AdminEvent::query()->where('type', 'payment_failed')->count());
    }

    public function test_a_failure_without_detail_records_a_default_reason(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-sub-5', 'status' => 'rejected'], 200),
        ]);

        $submission = $this->createSubmission();
        $this->createApprovedPayment([
            'status' => PaymentStatus::Pending->value,
            'external_id' => 'mp-sub-5',
            'renewal_submission_id' => $submission->id,
        ]);

        $this->sendSigned('mp-sub-5', ['type' => 'preapproval', 'id' => 'evt-f2', 'data' => ['id' => 'mp-sub-5']]);

        $this->assertSame('Charge declined', $submission->refresh()->recurrence_issue);
    }

    public function test_a_failure_on_a_first_purchase_does_not_touch_any_contract(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-first', 'status' => 'rejected'], 200),
        ]);

        $this->createApprovedPayment([
            'status' => PaymentStatus::Pending->value,
            'external_id' => 'mp-first',
            'renewal_submission_id' => null,
        ]);

        $this->sendSigned('mp-first', ['type' => 'payment', 'id' => 'evt-first', 'data' => ['id' => 'mp-first']])
            ->assertOk()
            ->assertJsonPath('processed', true);

        $this->assertSame(1, AdminEvent::query()->where('type', 'payment_failed')->count());
    }

    public function test_an_approval_for_a_first_purchase_never_creates_a_contract(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-new', 'status' => 'approved'], 200),
        ]);

        $this->createApprovedPayment([
            'status' => PaymentStatus::Pending->value,
            'external_id' => 'mp-new',
            'renewal_submission_id' => null,
        ]);

        $this->sendSigned('mp-new', ['type' => 'payment', 'id' => 'evt-new', 'data' => ['id' => 'mp-new']])->assertOk();

        $this->assertSame(0, SubmissionRenewal::query()->count());
        $this->assertSame(0, AdminEvent::query()->where('type', 'renewal_approved')->count());
        $this->assertNotNull(Payment::query()->firstOrFail()->contract_activated_at);
    }

    public function test_a_renewal_for_a_deleted_contract_is_tolerated(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-orphan', 'status' => 'approved'], 200),
        ]);

        $this->createApprovedPayment([
            'status' => PaymentStatus::Pending->value,
            'external_id' => 'mp-orphan',
            'renewal_submission_id' => str_repeat('a', 24),
        ]);

        $this->sendSigned('mp-orphan', ['type' => 'payment', 'id' => 'evt-orphan', 'data' => ['id' => 'mp-orphan']])
            ->assertOk()
            ->assertJsonPath('processed', true);

        $this->assertSame(0, SubmissionRenewal::query()->count());
    }

    public function test_an_authorized_payment_notification_matches_its_parent_preapproval(): void
    {
        Http::fake([
            'api.mercadopago.com/authorized_payments/*' => Http::response(
                ['id' => 'auth-1', 'preapproval_id' => 'mp-parent', 'status' => 'approved'],
                200,
            ),
        ]);

        $submission = $this->createSubmission();
        $this->createApprovedPayment([
            'status' => PaymentStatus::Pending->value,
            'external_id' => 'mp-parent',
            'renewal_submission_id' => $submission->id,
        ]);

        $this->sendSigned('auth-1', [
            'type' => 'subscription_authorized_payment',
            'id' => 'evt-auth',
            'data' => ['id' => 'auth-1'],
        ])->assertOk()->assertJsonPath('processed', true);

        $this->assertSame(1, $submission->refresh()->renewal_count);
    }

    public function test_an_unrelated_topic_is_ignored(): void
    {
        $this->sendSigned('mp-1', ['type' => 'plan', 'id' => 'evt-plan', 'data' => ['id' => 'mp-1']])
            ->assertOk()
            ->assertJsonPath('processed', false);

        $this->assertSame(0, PaymentWebhookEvent::query()->count());
    }

    public function test_a_notification_without_a_resource_id_is_ignored(): void
    {
        $this->withHeaders([
            'x-signature' => $this->signature('mp-1'),
            'x-request-id' => 'req-1',
        ])
            ->postJson($this->apiUrl('payments/webhooks/mercado_pago').'?data.id=mp-1', ['type' => 'payment'])
            ->assertOk()
            ->assertJsonPath('processed', false);
    }

    public function test_an_unreachable_gateway_lookup_returns_bad_request(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['message' => 'not found'], 404),
        ]);

        $this->sendSigned('mp-404', ['type' => 'payment', 'id' => 'evt-404', 'data' => ['id' => 'mp-404']])
            ->assertStatus(400)
            ->assertJsonPath('code', 'payment_webhook_rejected');
    }

    public function test_an_unconfigured_gateway_returns_bad_request(): void
    {
        $this->postJson($this->apiUrl('payments/webhooks/stripe'), ['type' => 'payment', 'data' => ['id' => 'x']])
            ->assertStatus(400)
            ->assertJsonPath('code', 'payment_webhook_rejected');
    }

    public function test_the_event_id_falls_back_to_the_topic_when_absent(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-noid', 'status' => 'approved'], 200),
        ]);

        $this->createApprovedPayment([
            'status' => PaymentStatus::Pending->value,
            'external_id' => 'mp-noid',
        ]);

        $this->sendSigned('mp-noid', ['type' => 'payment', 'data' => ['id' => 'mp-noid']])->assertOk();

        $this->assertSame('payment:mp-noid:approved', PaymentWebhookEvent::query()->firstOrFail()->event_id);
    }

    public function test_the_resource_id_may_arrive_at_the_payload_root(): void
    {
        Http::fake([
            'api.mercadopago.com/*' => Http::response(['id' => 'mp-root', 'status' => 'approved'], 200),
        ]);

        $this->createApprovedPayment([
            'status' => PaymentStatus::Pending->value,
            'external_id' => 'mp-root',
        ]);

        $this->withHeaders([
            'x-signature' => $this->signature('mp-root'),
            'x-request-id' => 'req-1',
        ])
            ->postJson($this->apiUrl('payments/webhooks/mercado_pago').'?data.id=mp-root', [
                'topic' => 'payment',
                'id' => 'mp-root',
            ])
            ->assertOk()
            ->assertJsonPath('processed', true);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return TestResponse<JsonResponse>
     */
    private function sendSigned(string $dataId, array $payload): TestResponse
    {
        return $this->withHeaders([
            'x-signature' => $this->signature($dataId),
            'x-request-id' => 'req-1',
        ])->postJson($this->apiUrl('payments/webhooks/mercado_pago'), $payload);
    }

    /**
     * @return array<string, mixed>
     */
    private function notification(string $dataId): array
    {
        return ['type' => 'payment', 'id' => 'evt-x', 'data' => ['id' => $dataId]];
    }

    private function signature(string $dataId): string
    {
        $timestamp = '1700000000';
        $manifest = 'id:'.strtolower($dataId).";request-id:req-1;ts:{$timestamp};";

        return "ts={$timestamp},v1=".hash_hmac('sha256', $manifest, self::SECRET);
    }
}
