<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use InvalidArgumentException;

class HashPassword extends Command
{
    protected $signature = 'platform:hash {password}';

    protected $description = 'Prints the argon2id hash of a password to paste into the seeder';

    public function handle(): int
    {
        $password = $this->argument('password');
        if (! is_string($password)) {
            throw new InvalidArgumentException('The password argument must be a string.');
        }

        $this->line(Hash::make($password));

        return self::SUCCESS;
    }
}
