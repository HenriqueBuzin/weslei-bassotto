<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Editing the questionnaire used to be silent for people who already had a
 * contract: a new required question only surfaced as an unexplained validation
 * error the next time they saved. This marks the contract so the subscriber area
 * can ask them to review, and the answer update clears it again.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consultancy_submissions', function (Blueprint $table): void {
            $table->timestampTz('questionnaire_changed_at')->nullable();
            $table->index('questionnaire_changed_at');
        });
    }

    public function down(): void
    {
        Schema::table('consultancy_submissions', function (Blueprint $table): void {
            $table->dropIndex(['questionnaire_changed_at']);
            $table->dropColumn('questionnaire_changed_at');
        });
    }
};
