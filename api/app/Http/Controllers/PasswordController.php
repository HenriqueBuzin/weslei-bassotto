<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Exceptions\ApiException;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Models\PasswordResetToken;
use App\Models\User;
use App\Services\PasswordResetService;
use App\Services\RefreshSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Hash;

class PasswordController extends Controller
{
    public function __construct(
        private readonly PasswordResetService $resets,
        private readonly RefreshSessionService $sessions,
    ) {}

    /**
     * Always answers as if the address existed, so the endpoint cannot be used
     * to discover which e-mails are registered.
     */
    public function forgot(ForgotPasswordRequest $request): JsonResponse
    {
        $email = strtolower(trim($request->string('email')->value()));
        $user = User::query()->where('email', $email)->first();

        if ($user === null) {
            return new JsonResponse(['ok' => true, 'email_sent' => false, 'reset_url' => null]);
        }

        $token = $this->resets->issueToken($user);
        $resetUrl = $this->resets->resetUrl($token);
        $isDev = Config::get('platform.env') === 'dev';

        if (! $this->resets->smtpConfigured()) {
            return new JsonResponse([
                'ok' => true,
                'email_sent' => false,
                'reset_url' => $isDev ? $resetUrl : null,
            ]);
        }

        $this->resets->sendResetEmail($email, $resetUrl);

        return new JsonResponse([
            'ok' => true,
            'email_sent' => true,
            'reset_url' => $isDev ? $resetUrl : null,
        ]);
    }

    public function reset(ResetPasswordRequest $request): JsonResponse
    {
        $record = $this->resets->consumeToken($request->string('token')->value());

        if ($record === null) {
            throw ApiException::badRequest('password_reset_token_invalid', 'The reset link is invalid, expired or already used');
        }

        User::query()
            ->whereKey($record->user_id)
            ->update(['password_hash' => Hash::make($request->string('password')->value())]);

        $this->sessions->revokeAllForUser($record->user_id, 'password_reset');

        PasswordResetToken::query()
            ->where('user_id', $record->user_id)
            ->whereNull('used_at')
            ->update(['used_at' => Carbon::now()]);

        return new JsonResponse(['ok' => true]);
    }
}
