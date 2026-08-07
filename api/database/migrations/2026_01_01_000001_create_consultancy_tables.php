<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consultancy_questions', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->string('label', 220);
            $table->string('type', 20)->default('textarea');
            $table->json('options');
            $table->boolean('required')->default(true);
            $table->boolean('active')->default(true);
            $table->integer('position')->default(0);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->index(['active', 'position']);
        });

        Schema::create('consultancy_submissions', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->string('customer_name', 120);
            $table->string('customer_email');
            $table->string('customer_phone', 30);
            $table->string('plan_slug', 20);
            $table->string('plan_name');
            $table->unsignedSmallInteger('plan_months');
            $table->date('plan_start_date')->nullable();
            $table->date('plan_end_date')->nullable();
            $table->string('status', 20)->default('pending_payment');
            $table->char('payment_id', 24)->nullable();
            $table->string('payment_reference')->nullable();
            $table->string('payment_gateway')->nullable();
            $table->json('answers');
            $table->timestampTz('answers_changed_at')->nullable();
            $table->timestampTz('answers_seen_at')->nullable();
            $table->unsignedInteger('renewal_count')->default(0);
            $table->string('recurrence_status')->nullable();
            $table->text('recurrence_issue')->nullable();
            $table->timestampTz('last_renewed_at')->nullable();
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');

            $table->index('customer_email');
        });

        Schema::create('submission_answer_revisions', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->char('submission_id', 24);
            $table->json('answers');
            $table->timestampTz('changed_at');
            $table->string('changed_by', 20);

            $table->foreign('submission_id')->references('id')->on('consultancy_submissions')->cascadeOnDelete();
            $table->index(['submission_id', 'changed_at']);
        });

        Schema::create('submission_renewals', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->char('submission_id', 24);
            $table->string('plan_slug', 20);
            $table->string('plan_name');
            $table->unsignedSmallInteger('months');
            $table->date('start_date');
            $table->date('end_date');
            $table->char('payment_id', 24);
            $table->string('gateway');
            $table->string('payment_reference')->nullable();
            $table->timestampTz('created_at');

            $table->foreign('submission_id')->references('id')->on('consultancy_submissions')->cascadeOnDelete();
            $table->index(['submission_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('submission_renewals');
        Schema::dropIfExists('submission_answer_revisions');
        Schema::dropIfExists('consultancy_submissions');
        Schema::dropIfExists('consultancy_questions');
    }
};
