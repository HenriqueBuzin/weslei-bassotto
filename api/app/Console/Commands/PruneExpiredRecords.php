<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\LoginAttempt;
use App\Models\PasswordResetToken;
use App\Models\PaymentWebhookEvent;
use App\Models\RefreshSession;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * These tables only ever grew before: nothing removed the rows whose whole
 * purpose had expired. Runs from the scheduler.
 */
class PruneExpiredRecords extends Command
{
    protected $signature = 'platform:prune {--webhook-retention-days=90}';

    protected $description = 'Removes expired sessions, tokens and webhook events';

    public function handle(): int
    {
        $now = Carbon::now();
        $webhookCutoff = $now->copy()->subDays((int) $this->option('webhook-retention-days'));

        $removed = [
            'refresh_sessions' => RefreshSession::query()->where('expires_at', '<', $now)->delete(),
            'password_reset_tokens' => PasswordResetToken::query()->where('expires_at', '<', $now)->delete(),
            'login_attempts' => LoginAttempt::query()->where('expires_at', '<', $now)->delete(),
            'payment_webhook_events' => PaymentWebhookEvent::query()
                ->where('received_at', '<', $webhookCutoff)
                ->delete(),
        ];

        foreach ($removed as $table => $count) {
            $this->info("[PRUNE] {$table}: {$count}");
        }

        return self::SUCCESS;
    }
}
