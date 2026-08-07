<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\PlanCatalog;
use App\Models\ConsultancySubmission;
use App\Models\Payment;
use App\Models\PaymentWebhookEvent;
use App\Payments\ChargeRequest;
use App\Payments\GatewayRegistry;
use App\Payments\GatewayRejected;
use App\Payments\GatewayUnavailable;
use App\Payments\PaymentStatus;
use App\Support\RecordId;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class PaymentService
{
    public function __construct(
        private readonly GatewayRegistry $registry,
        private readonly ContractService $contracts,
    ) {}

    public static function hashToken(string $value): string
    {
        return hash('sha256', $value);
    }

    /**
     * Attempts the charge across the configured gateways. A rejection stops the
     * fallback chain so the customer is never charged twice for one purchase.
     *
     * @return array{0: Payment, 1: string} The payment and its claim token.
     */
    public function create(
        string $planSlug,
        string $mode,
        string $payerEmail,
        string $cardToken,
        ?string $paymentMethodId,
        ?string $accountEmail = null,
        ?string $renewalSubmissionId = null,
        ?string $preferredGateway = null,
    ): array {
        $plan = PlanCatalog::get($planSlug);
        $claimToken = Str::random(43);
        $amount = $plan->amountFor($mode);

        $payment = Payment::query()->create([
            'plan_slug' => $planSlug,
            'mode' => $mode,
            'amount' => $amount,
            'payer_email' => strtolower($payerEmail),
            'account_email' => $accountEmail === null ? null : strtolower($accountEmail),
            'renewal_submission_id' => $renewalSubmissionId,
            'claim_token_hash' => self::hashToken($claimToken),
            'status' => PaymentStatus::Pending->value,
        ]);

        $request = new ChargeRequest(
            reference: "payment:{$payment->id}",
            description: $this->describe($plan->name, $mode, $plan->months),
            amount: $amount,
            payerEmail: $payerEmail,
            cardToken: $cardToken,
            paymentMethodId: $paymentMethodId,
            mode: $mode,
            installments: $mode === 'cash' ? 1 : $plan->months,
        );

        $errors = [];

        foreach ($this->registry->candidates($preferredGateway) as $gateway) {
            try {
                $result = $gateway->createCharge($request);
            } catch (GatewayRejected $exception) {
                $this->recordRejection($payment, $gateway->name(), $exception->getMessage());

                throw $exception;
            } catch (GatewayUnavailable $exception) {
                $errors[] = "{$gateway->name()}: {$exception->getMessage()}";
                $this->recordAttempt($payment, $gateway->name(), 'unavailable', null, $exception->getMessage());

                continue;
            }

            $payment->fill([
                'gateway' => $result->gateway,
                'external_id' => $result->externalId,
                'status' => $result->status->value,
                'status_detail' => $result->statusDetail,
            ])->save();

            $this->recordAttempt($payment, $result->gateway, $result->status->value, $result->externalId, $result->statusDetail);

            if ($result->status === PaymentStatus::Approved && $payment->renewal_submission_id !== null) {
                $this->contracts->activate($payment);
            } elseif ($result->status === PaymentStatus::Failed) {
                $this->contracts->recordAdminEvent('payment_failed', paymentId: $payment->id);
            }

            return [$payment, $claimToken];
        }

        $payment->fill([
            'status' => PaymentStatus::Failed->value,
            'status_detail' => implode('; ', $errors),
        ])->save();
        $this->contracts->recordAdminEvent('payment_failed', paymentId: $payment->id);

        throw new GatewayUnavailable('No gateway could start the charge');
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function applyWebhook(string $gatewayName, array $payload): bool
    {
        $event = $this->registry->get($gatewayName)->parseWebhook($payload);

        if ($event === null) {
            return false;
        }

        $payment = Payment::query()
            ->where('gateway', $gatewayName)
            ->where('external_id', $event->externalId)
            ->first();

        try {
            PaymentWebhookEvent::query()->create([
                'gateway' => $gatewayName,
                'event_id' => $event->eventId,
                'external_id' => $event->externalId,
                'received_at' => Carbon::now(),
                'matched' => $payment !== null,
            ]);
        } catch (QueryException) {
            // Already processed: the unique (gateway, event_id) pair rejected it.
            return false;
        }

        if ($payment === null) {
            return false;
        }

        $previousStatus = $payment->status;
        $payment->fill(['status' => $event->status->value, 'status_detail' => $event->statusDetail])->save();

        if ($event->status === PaymentStatus::Approved && $previousStatus !== PaymentStatus::Approved->value) {
            $this->contracts->activate($payment);
        } elseif ($event->status === PaymentStatus::Failed) {
            $this->contracts->recordAdminEvent('payment_failed', paymentId: $payment->id);
            $this->flagRecurrenceFailure($payment, $event->statusDetail);
        }

        return true;
    }

    public function findApprovedByClaim(string $paymentId, string $claimToken): ?Payment
    {
        if (! RecordId::isValid($paymentId) || $claimToken === '') {
            return null;
        }

        return Payment::query()
            ->whereKey(RecordId::normalize($paymentId))
            ->where('claim_token_hash', self::hashToken($claimToken))
            ->where('status', PaymentStatus::Approved->value)
            ->first();
    }

    public function findByClaim(string $paymentId, string $claimToken): ?Payment
    {
        if (! RecordId::isValid($paymentId)) {
            return null;
        }

        return Payment::query()
            ->whereKey(RecordId::normalize($paymentId))
            ->where('claim_token_hash', self::hashToken($claimToken))
            ->first();
    }

    private function flagRecurrenceFailure(Payment $payment, ?string $detail): void
    {
        if ($payment->renewal_submission_id === null) {
            return;
        }

        ConsultancySubmission::query()
            ->whereKey($payment->renewal_submission_id)
            ->update([
                'recurrence_status' => 'failed',
                'recurrence_issue' => $detail ?? 'Charge declined',
                'updated_at' => Carbon::now(),
            ]);
    }

    private function recordRejection(Payment $payment, string $gateway, string $detail): void
    {
        $payment->fill([
            'status' => PaymentStatus::Failed->value,
            'status_detail' => $detail,
        ])->save();

        $this->recordAttempt($payment, $gateway, 'rejected', null, $detail);
        $this->contracts->recordAdminEvent('payment_failed', paymentId: $payment->id);
    }

    private function recordAttempt(
        Payment $payment,
        string $gateway,
        string $status,
        ?string $externalId,
        ?string $detail,
    ): void {
        $payment->attempts()->create([
            'gateway' => $gateway,
            'status' => $status,
            'external_id' => $externalId,
            'detail' => $detail,
            'created_at' => Carbon::now(),
        ]);
    }

    /** Reaches the customer's card statement, so the wording is localized. */
    private function describe(string $planName, string $mode, int $months): string
    {
        return $mode === 'cash'
            ? __('payments.description.cash', ['plan' => $planName])
            : __('payments.description.subscription', ['plan' => $planName, 'months' => $months]);
    }
}
