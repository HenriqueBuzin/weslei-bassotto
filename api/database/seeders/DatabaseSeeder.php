<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    private const ROLES = [
        'admin' => 'Administrator',
        'user' => 'Default user',
    ];

    public function run(): void
    {
        $this->seedRoles();
        $this->seedAdmins();
    }

    private function seedRoles(): void
    {
        foreach (self::ROLES as $name => $description) {
            Role::query()->firstOrCreate(['name' => $name], ['description' => $description]);
        }
    }

    /**
     * The password below is a placeholder: `must_change_password` forces each
     * admin to replace it on first login, so it never stays valid. Uses
     * firstOrCreate on purpose — updateOrCreate would reset the real password
     * back to the placeholder on every deploy.
     */
    private function seedAdmins(): void
    {
        $admins = [
            [
                'email' => 'bassottow@gmail.com',
                'password' => 'TrocarNoPrimeiroAcesso1!',
            ],
            [
                'email' => 'henrique.buzin@hotmail.com',
                'password' => 'TrocarNoPrimeiroAcesso1!',
            ],
        ];

        $adminRole = Role::query()->where('name', 'admin')->firstOrFail();

        foreach ($admins as $admin) {
            $user = User::query()->firstOrCreate(
                ['email' => strtolower($admin['email'])],
                [
                    'password_hash' => Hash::make($admin['password']),
                    'must_change_password' => true,
                    'created_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ],
            );

            $user->roles()->syncWithoutDetaching([$adminRole->id]);

            $this->command->info("[SEED] Administrator ready: {$user->email}");
        }
    }
}
