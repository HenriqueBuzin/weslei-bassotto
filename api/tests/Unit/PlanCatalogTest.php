<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Domain\PlanCatalog;
use Illuminate\Support\Carbon;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class PlanCatalogTest extends TestCase
{
    public function test_lists_the_three_published_plans(): void
    {
        $plans = PlanCatalog::all();

        $this->assertSame(['trimestral', 'semestral', 'anual'], array_keys($plans));
        $this->assertSame(PlanCatalog::SLUGS, array_keys($plans));
    }

    public function test_returns_plan_pricing_by_slug(): void
    {
        $plan = PlanCatalog::get('anual');

        $this->assertSame('Plano Anual', $plan->name);
        $this->assertSame(12, $plan->months);
        $this->assertSame('1597.00', $plan->cashAmount);
        $this->assertSame('1863.00', $plan->subscriptionTotal);
        $this->assertSame('155.25', $plan->monthlyAmount);
    }

    public function test_rejects_an_unknown_slug(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessage('Unknown plan: mensal');

        PlanCatalog::get('mensal');
    }

    public function test_cash_mode_charges_the_full_amount_and_subscription_charges_the_installment(): void
    {
        $plan = PlanCatalog::get('semestral');

        $this->assertSame('997.00', $plan->amountFor('cash'));
        $this->assertSame('182.23', $plan->amountFor('subscription'));
    }

    #[DataProvider('monthArithmeticProvider')]
    public function test_adds_months_clamping_to_the_last_valid_day(string $from, int $months, string $expected): void
    {
        $this->assertSame($expected, PlanCatalog::addMonths(Carbon::parse($from), $months)->toDateString());
    }

    /**
     * @return iterable<string, array{0: string, 1: int, 2: string}>
     */
    public static function monthArithmeticProvider(): iterable
    {
        yield 'simple quarter' => ['2026-01-15', 3, '2026-04-15'];
        yield 'crosses the year' => ['2026-11-10', 3, '2027-02-10'];
        yield 'full year' => ['2026-03-31', 12, '2027-03-31'];
        yield 'clamps to february' => ['2026-01-31', 1, '2026-02-28'];
        yield 'clamps to a 30 day month' => ['2026-05-31', 1, '2026-06-30'];
        yield 'leap february' => ['2028-01-31', 1, '2028-02-29'];
    }

    public function test_a_new_contract_starts_today(): void
    {
        $today = Carbon::parse('2026-06-10');

        [$start, $end] = PlanCatalog::contractPeriod(3, today: $today);

        $this->assertSame('2026-06-10', $start->toDateString());
        $this->assertSame('2026-09-10', $end->toDateString());
    }

    public function test_a_renewal_starts_when_the_running_contract_ends(): void
    {
        $today = Carbon::parse('2026-06-10');
        $currentEnd = Carbon::parse('2026-08-01');

        [$start, $end] = PlanCatalog::contractPeriod(6, today: $today, currentEnd: $currentEnd);

        $this->assertSame('2026-08-01', $start->toDateString());
        $this->assertSame('2027-02-01', $end->toDateString());
    }

    public function test_an_expired_contract_renews_from_today_instead_of_the_past(): void
    {
        $today = Carbon::parse('2026-06-10');
        $currentEnd = Carbon::parse('2026-01-01');

        [$start, $end] = PlanCatalog::contractPeriod(3, today: $today, currentEnd: $currentEnd);

        $this->assertSame('2026-06-10', $start->toDateString());
        $this->assertSame('2026-09-10', $end->toDateString());
    }

    public function test_a_contract_ending_today_renews_from_today(): void
    {
        $today = Carbon::parse('2026-06-10');

        [$start] = PlanCatalog::contractPeriod(3, today: $today, currentEnd: Carbon::parse('2026-06-10'));

        $this->assertSame('2026-06-10', $start->toDateString());
    }

    public function test_defaults_to_the_current_date_when_no_reference_is_given(): void
    {
        Carbon::setTestNow('2026-07-04 15:00:00');

        [$start, $end] = PlanCatalog::contractPeriod(12);

        $this->assertSame('2026-07-04', $start->toDateString());
        $this->assertSame('2027-07-04', $end->toDateString());

        Carbon::setTestNow();
    }
}
