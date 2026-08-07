<?php

declare(strict_types=1);

namespace Tests;

use App\Models\ConsultancyQuestion;
use App\Models\ConsultancySubmission;
use App\Models\Payment;
use App\Models\Role;
use App\Models\User;
use App\Payments\PaymentStatus;
use App\Services\PaymentService;
use App\Services\TokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Testing\PendingCommand;

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;
    use RefreshDatabase;

    /**
     * Laravel types artisan() as PendingCommand|int, so every assertion on it
     * would look like a call on an int. This narrows it once.
     *
     * @param  array<string, mixed>  $parameters
     */
    protected function runArtisan(string $command, array $parameters = []): PendingCommand
    {
        $pending = $this->artisan($command, $parameters);

        $this->assertInstanceOf(PendingCommand::class, $pending);

        return $pending;
    }

    /**
     * @param  list<string>  $roles
     */
    protected function createUser(
        string $email = 'aluno@example.com',
        string $password = 'segredo123',
        array $roles = ['user'],
        bool $mustChangePassword = false,
    ): User {
        $user = User::query()->create([
            'email' => strtolower($email),
            'password_hash' => Hash::make($password),
            'must_change_password' => $mustChangePassword,
        ]);

        foreach ($roles as $roleName) {
            $role = Role::query()->firstOrCreate(['name' => $roleName], ['description' => ucfirst($roleName)]);
            $user->roles()->attach($role->id);
        }

        return $user->load('roles');
    }

    protected function createAdmin(string $email = 'admin@example.com', string $password = 'segredo123'): User
    {
        return $this->createUser($email, $password, ['admin']);
    }

    /**
     * @return array<string, string>
     */
    protected function authHeader(User $user): array
    {
        $token = app(TokenService::class)->createAccessToken($user->id, $user->roleNames());

        return ['Authorization' => "Bearer {$token}"];
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    protected function createQuestion(array $attributes = []): ConsultancyQuestion
    {
        return ConsultancyQuestion::query()->create([
            'label' => 'Qual seu objetivo?',
            'type' => 'textarea',
            'options' => [],
            'required' => true,
            'active' => true,
            'position' => 0,
            ...$attributes,
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     * @return array{0: Payment, 1: string} The payment and its claim token.
     */
    protected function createApprovedPayment(array $attributes = []): array
    {
        $claimToken = 'claim-token-'.bin2hex(random_bytes(4));

        $payment = Payment::query()->create([
            'plan_slug' => 'trimestral',
            'mode' => 'cash',
            'amount' => '597.00',
            'payer_email' => 'aluno@example.com',
            'account_email' => 'aluno@example.com',
            'claim_token_hash' => PaymentService::hashToken($claimToken),
            'status' => PaymentStatus::Approved->value,
            'gateway' => 'mercado_pago',
            'external_id' => 'mp-'.bin2hex(random_bytes(4)),
            ...$attributes,
        ]);

        return [$payment, $claimToken];
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    protected function createSubmission(array $attributes = []): ConsultancySubmission
    {
        return ConsultancySubmission::query()->create([
            'customer_name' => 'Aluno Teste',
            'customer_email' => 'aluno@example.com',
            'customer_phone' => '5554999999999',
            'plan_slug' => 'trimestral',
            'plan_name' => 'Plano Trimestral',
            'plan_months' => 3,
            'plan_start_date' => Carbon::parse('2026-01-01'),
            'plan_end_date' => Carbon::parse('2026-04-01'),
            'status' => 'active',
            'answers' => [],
            'answers_changed_at' => Carbon::now(),
            'renewal_count' => 0,
            ...$attributes,
        ]);
    }

    protected function apiUrl(string $path): string
    {
        return '/api/v1/'.ltrim($path, '/');
    }
}
