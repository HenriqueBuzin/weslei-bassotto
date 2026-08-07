<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->string('plan_slug', 20);
            $table->string('mode', 20);
            $table->decimal('amount', 10, 2);
            $table->string('payer_email');
            $table->string('account_email')->nullable();
            $table->char('renewal_submission_id', 24)->nullable();
            $table->char('claim_token_hash', 64)->unique();
            $table->string('status', 20);
            $table->text('status_detail')->nullable();
            $table->string('gateway')->nullable();
            $table->string('external_id')->nullable();
            $table->char('claimed_submission_id', 24)->nullable();
            $table->timestampTz('contract_activated_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->unique(['gateway', 'external_id']);
        });

        Schema::create('payment_attempts', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->char('payment_id', 24);
            $table->string('gateway');
            $table->string('status', 20);
            $table->string('external_id')->nullable();
            $table->text('detail')->nullable();
            $table->timestampTz('created_at');

            $table->foreign('payment_id')->references('id')->on('payments')->cascadeOnDelete();
            $table->index(['payment_id', 'created_at']);
        });

        Schema::create('payment_webhook_events', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->string('gateway');
            $table->string('event_id');
            $table->string('external_id');
            $table->timestampTz('received_at');
            $table->boolean('matched');

            $table->unique(['gateway', 'event_id']);
        });

        Schema::create('contract_events', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->char('payment_id', 24);
            $table->char('submission_id', 24);
            $table->string('type', 40);
            $table->timestampTz('created_at');

            $table->unique(['payment_id', 'type']);
        });

        Schema::create('admin_events', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->string('type', 40);
            $table->char('submission_id', 24)->nullable();
            $table->char('payment_id', 24)->nullable();
            $table->timestampTz('seen_at')->nullable();
            $table->timestampTz('created_at');

            $table->index(['type', 'seen_at']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_events');
        Schema::dropIfExists('contract_events');
        Schema::dropIfExists('payment_webhook_events');
        Schema::dropIfExists('payment_attempts');
        Schema::dropIfExists('payments');
    }
};
