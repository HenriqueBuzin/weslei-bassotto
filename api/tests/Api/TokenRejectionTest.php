<?php

declare(strict_types=1);

namespace Tests\Api;

use App\Services\TokenService;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Each way a bearer token can be wrong answers 401 with its own code, so the
 * frontend can tell "log in again" apart from "you were deleted".
 */
final class TokenRejectionTest extends TestCase
{
    public function test_a_request_without_a_token_is_unauthenticated(): void
    {
        $this->getJson($this->apiUrl('me'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'unauthenticated')
            ->assertHeader('WWW-Authenticate', 'Bearer');
    }

    public function test_a_garbage_token_is_rejected_as_invalid(): void
    {
        $this->withHeaders(['Authorization' => 'Bearer not-a-jwt'])
            ->getJson($this->apiUrl('me'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'access_token_invalid');
    }

    public function test_a_refresh_token_cannot_stand_in_for_an_access_token(): void
    {
        $user = $this->createUser();
        $refresh = app(TokenService::class)->createRefreshToken($user->id, Carbon::now()->addHour());

        $this->withHeaders(['Authorization' => "Bearer {$refresh}"])
            ->getJson($this->apiUrl('me'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'access_token_expected');
    }

    public function test_an_access_token_without_a_usable_subject_is_rejected(): void
    {
        $token = app(TokenService::class)->createAccessToken('not-an-id', ['user']);

        $this->withHeaders(['Authorization' => "Bearer {$token}"])
            ->getJson($this->apiUrl('me'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'access_token_invalid');
    }

    public function test_a_token_for_a_deleted_account_is_rejected(): void
    {
        $user = $this->createUser();
        $headers = $this->authHeader($user);
        $user->delete();

        $this->withHeaders($headers)
            ->getJson($this->apiUrl('me'))
            ->assertStatus(401)
            ->assertJsonPath('code', 'user_not_found');
    }
}
