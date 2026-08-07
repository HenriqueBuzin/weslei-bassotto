<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class HashPassword extends Command
{
    protected $signature = 'platform:hash {password}';

    protected $description = 'Prints the argon2id hash of a password to paste into the seeder';

    public function handle(): int
    {
        $this->line(Hash::make((string) $this->argument('password')));

        return self::SUCCESS;
    }
}
