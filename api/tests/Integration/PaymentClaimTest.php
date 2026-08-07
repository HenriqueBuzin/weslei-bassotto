<?php

declare(strict_types=1);

namespace Tests\Integration;

use App\Models\ConsultancySubmission;
use App\Payments\PaymentStatus;
use App\Services\PaymentService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class PaymentClaimTest extends TestCase
{
    /**
     * A renewal paid by an instantly approved card must extend the contract at
     * charge time: no webhook is coming to do it later.
     */
    public function test_an_approved_renewal_charge_activates_the_contract_immediately(): void
    {
        Http::fake([
            'api.mercadopago.com/v1/payments' => Http::response(['id' => 'mp-99', 'status' => 'approved'], 201),
        ]);

        $submission = $this->createSubmission([
            'plan_slug' => 'trimestral',
            'plan_months' => 3,
            'plan_end_date' => '2026-09-10',
            'renewal_count' => 0,
        ]);

        [$payment] = app(PaymentService::class)->create(
            planSlug: 'trimestral',
            mode: 'cash',
            payerEmail: 'aluno@example.com',
            cardToken: 'card-token',
            paymentMethodId: null,
            accountEmail: 'aluno@example.com',
            renewalSubmissionId: $submission->id,
        );

        $this->assertSame(PaymentStatus::Approved->value, $payment->status);

        $renewed = ConsultancySubmission::query()->findOrFail($submission->id);
        $this->assertSame(1, $renewed->renewal_count);
        $this->assertTrue($renewed->plan_end_date->greaterThan('2026-09-10'));
    }

    public function test_a_claim_with_a_malformed_payment_id_matches_nothing(): void
    {
        [, $claimToken] = $this->createApprovedPayment();

        $this->assertNull(app(PaymentService::class)->findApprovedByClaim('not-an-id', $claimToken));
    }

    public function test_a_claim_without_a_token_matches_nothing(): void
    {
        [$payment] = $this->createApprovedPayment();

        $this->assertNull(app(PaymentService::class)->findApprovedByClaim($payment->id, ''));
    }
}
