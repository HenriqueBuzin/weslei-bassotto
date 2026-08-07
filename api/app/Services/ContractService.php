<?php

declare(strict_types=1);

namespace App\Services;

use App\Domain\PlanCatalog;
use App\Models\AdminEvent;
use App\Models\ConsultancySubmission;
use App\Models\ContractEvent;
use App\Models\Payment;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;

class ContractService
{
    /**
     * Creates or renews a contract exactly once per approved payment. The
     * `contract_activated_at` claim is the idempotency guard, so a replayed
     * webhook returns the contract that was already activated.
     */
    public function activate(Payment $payment): ?ConsultancySubmission
    {
        $claimed = Payment::query()
            ->whereKey($payment->id)
            ->whereNull('contract_activated_at')
            ->update(['contract_activated_at' => Carbon::now(), 'updated_at' => Carbon::now()]);

        if ($claimed !== 1) {
            return $this->alreadyActivated($payment);
        }

        if ($payment->renewal_submission_id === null) {
            return null;
        }

        $submission = ConsultancySubmission::query()->find($payment->renewal_submission_id);

        if ($submission === null) {
            return null;
        }

        return $this->renew($submission, $payment);
    }

    public function recordAdminEvent(string $type, ?string $submissionId = null, ?string $paymentId = null): void
    {
        AdminEvent::query()->create([
            'type' => $type,
            'submission_id' => $submissionId,
            'payment_id' => $paymentId,
            'seen_at' => null,
            'created_at' => Carbon::now(),
        ]);
    }

    private function renew(ConsultancySubmission $submission, Payment $payment): ConsultancySubmission
    {
        $plan = PlanCatalog::get($payment->plan_slug);
        $now = Carbon::now();
        [$start, $end] = PlanCatalog::contractPeriod($plan->months, currentEnd: $submission->plan_end_date);

        $submission->renewals()->create([
            'plan_slug' => $plan->slug,
            'plan_name' => $plan->name,
            'months' => $plan->months,
            'start_date' => $start,
            'end_date' => $end,
            'payment_id' => $payment->id,
            'gateway' => (string) $payment->gateway,
            'payment_reference' => $payment->external_id,
            'created_at' => $now,
        ]);

        $submission->fill([
            'plan_slug' => $plan->slug,
            'plan_name' => $plan->name,
            'plan_months' => $plan->months,
            'plan_start_date' => $start,
            'plan_end_date' => $end,
            'status' => 'active',
            'payment_reference' => $payment->external_id,
            'payment_id' => $payment->id,
            'recurrence_status' => $payment->status,
            'recurrence_issue' => null,
            'last_renewed_at' => $now,
            'renewal_count' => $submission->renewal_count + 1,
        ])->save();

        $this->markContractEvent($payment, $submission);
        $this->recordAdminEvent('renewal_approved', $submission->id, $payment->id);

        return $submission->refresh();
    }

    private function markContractEvent(Payment $payment, ConsultancySubmission $submission): void
    {
        try {
            ContractEvent::query()->create([
                'payment_id' => $payment->id,
                'submission_id' => $submission->id,
                'type' => 'contract_activated',
                'created_at' => Carbon::now(),
            ]);
        } catch (QueryException) {
            // The unique (payment_id, type) pair already recorded this activation.
        }
    }

    private function alreadyActivated(Payment $payment): ?ConsultancySubmission
    {
        $event = ContractEvent::query()
            ->where('payment_id', $payment->id)
            ->where('type', 'contract_activated')
            ->first();

        return $event === null ? null : ConsultancySubmission::query()->find($event->submission_id);
    }
}
