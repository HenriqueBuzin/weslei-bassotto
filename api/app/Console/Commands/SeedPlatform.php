<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Database\Seeders\DatabaseSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;

class SeedPlatform extends Command
{
    protected $signature = 'platform:seed {--force : Seed even when SEED_ON_START is disabled}';

    protected $description = 'Seeds roles and administrators, only while the database is empty';

    /** Every table the application owns; the seed only runs when all are empty. */
    private const TABLES = [
        'users',
        'roles',
        'refresh_sessions',
        'password_reset_tokens',
        'login_attempts',
        'consultancy_questions',
        'consultancy_submissions',
        'payments',
        'payment_webhook_events',
        'contract_events',
        'admin_events',
    ];

    public function handle(): int
    {
        if (! $this->option('force') && ! Config::get('platform.seed_on_start')) {
            $this->info('[SEED] Initial load disabled by SEED_ON_START.');

            return self::SUCCESS;
        }

        if ($this->databaseHasData()) {
            $this->info('[SEED] Database is not empty, skipping the initial load.');

            return self::SUCCESS;
        }

        $this->call('db:seed', ['--class' => DatabaseSeeder::class, '--force' => true]);
        $this->info('[SEED] Initial load finished.');

        return self::SUCCESS;
    }

    private function databaseHasData(): bool
    {
        foreach (self::TABLES as $table) {
            if (DB::table($table)->exists()) {
                return true;
            }
        }

        return false;
    }
}
