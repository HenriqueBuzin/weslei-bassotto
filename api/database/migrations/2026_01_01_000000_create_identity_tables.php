<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->string('email')->unique();
            $table->string('password_hash');
            $table->boolean('must_change_password')->default(false);
            $table->timestampTz('created_at');
            $table->timestampTz('updated_at');
        });

        Schema::create('roles', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->string('name')->unique();
            $table->string('description');
        });

        Schema::create('role_user', function (Blueprint $table): void {
            $table->char('user_id', 24);
            $table->char('role_id', 24);

            $table->primary(['user_id', 'role_id']);
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('role_id')->references('id')->on('roles')->cascadeOnDelete();
        });

        Schema::create('refresh_sessions', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->char('user_id', 24);
            $table->char('jti_hash', 64)->unique();
            $table->boolean('remember');
            $table->timestampTz('created_at');
            $table->timestampTz('expires_at');
            $table->timestampTz('revoked_at')->nullable();
            $table->string('revoke_reason')->nullable();
            $table->char('replaced_by_hash', 64)->nullable();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->index(['user_id', 'revoked_at']);
        });

        Schema::create('password_reset_tokens', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->char('user_id', 24);
            $table->char('token_hash', 64)->unique();
            $table->timestampTz('created_at');
            $table->timestampTz('expires_at');
            $table->timestampTz('used_at')->nullable();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->index(['user_id', 'used_at']);
        });

        Schema::create('login_attempts', function (Blueprint $table): void {
            $table->char('id', 24)->primary();
            $table->string('email')->unique();
            $table->unsignedInteger('attempts');
            $table->timestampTz('started_at');
            $table->timestampTz('locked_until')->nullable();
            $table->timestampTz('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('login_attempts');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('refresh_sessions');
        Schema::dropIfExists('role_user');
        Schema::dropIfExists('roles');
        Schema::dropIfExists('users');
    }
};
