<?php

declare(strict_types=1);

namespace Tests\Smoke;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class HealthTest extends TestCase
{
    public function test_the_root_health_endpoint_answers_ok(): void
    {
        $this->getJson('/health')->assertOk()->assertExactJson(['status' => 'ok', 'database' => 'ok']);
    }

    public function test_the_prefixed_health_endpoint_answers_ok(): void
    {
        $this->getJson($this->apiUrl('health'))
            ->assertOk()
            ->assertExactJson(['status' => 'ok', 'database' => 'ok']);
    }

    /**
     * `compose up --wait` and the Jenkins deploy gate read this endpoint, so an
     * unreachable database has to fail the check instead of passing as green.
     */
    public function test_an_unreachable_database_reports_the_container_unhealthy(): void
    {
        DB::shouldReceive('connection')->andThrow(new \RuntimeException('connection refused'));

        $this->getJson('/health')
            ->assertStatus(503)
            ->assertExactJson(['status' => 'error', 'database' => 'unreachable']);
    }

    public function test_the_plan_catalog_is_public(): void
    {
        $this->getJson($this->apiUrl('plans'))
            ->assertOk()
            ->assertJsonCount(3)
            ->assertJsonPath('0.slug', 'trimestral')
            ->assertJsonPath('0.cash', '597.00')
            ->assertJsonPath('0.subscription_total', '638.00')
            ->assertJsonPath('0.monthly', '212.66')
            ->assertJsonPath('2.slug', 'anual');
    }

    public function test_an_unknown_route_returns_json_not_html(): void
    {
        $this->getJson($this->apiUrl('nao-existe'))->assertNotFound()->assertJsonStructure(['code', 'detail']);
    }
}
