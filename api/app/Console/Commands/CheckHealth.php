<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * The production container runs PHP-FPM, which speaks FastCGI and cannot answer
 * an HTTP probe. Compose therefore checks health through the CLI instead.
 */
class CheckHealth extends Command
{
    protected $signature = 'platform:health';

    protected $description = 'Exits non-zero when the database cannot be reached';

    public function handle(): int
    {
        try {
            DB::connection()->getPdo()->query('SELECT 1');
        } catch (Throwable $exception) {
            $this->error('[HEALTH] database unreachable: '.$exception->getMessage());

            return self::FAILURE;
        }

        $this->info('[HEALTH] ok');

        return self::SUCCESS;
    }
}
