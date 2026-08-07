<?php

declare(strict_types=1);

namespace App\Domain;

use Illuminate\Support\Carbon;
use InvalidArgumentException;

final class PlanCatalog
{
    public const SLUGS = ['trimestral', 'semestral', 'anual'];

    /**
     * @return array<string, Plan>
     */
    public static function all(): array
    {
        return [
            'trimestral' => new Plan('trimestral', 'Plano Trimestral', 3, '597.00', '638.00', '212.66'),
            'semestral' => new Plan('semestral', 'Plano Semestral', 6, '997.00', '1093.00', '182.23'),
            'anual' => new Plan('anual', 'Plano Anual', 12, '1597.00', '1863.00', '155.25'),
        ];
    }

    public static function get(string $slug): Plan
    {
        $plan = self::all()[$slug] ?? null;

        if ($plan === null) {
            throw new InvalidArgumentException("Unknown plan: {$slug}");
        }

        return $plan;
    }

    /**
     * Clamps to the last day of the target month, mirroring the previous
     * Python implementation instead of rolling over into the next month.
     */
    public static function addMonths(Carbon $source, int $months): Carbon
    {
        $target = $source->copy()->startOfMonth()->addMonths($months);

        return $target->setDay(min($source->day, $target->daysInMonth));
    }

    /**
     * A renewal starts when the current contract ends, never before today.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    public static function contractPeriod(int $months, ?Carbon $today = null, ?Carbon $currentEnd = null): array
    {
        $today = ($today ?? Carbon::now())->startOfDay();
        $start = ($currentEnd !== null && $currentEnd->startOfDay()->greaterThan($today))
            ? $currentEnd->copy()->startOfDay()
            : $today->copy();

        return [$start, self::addMonths($start, $months)];
    }
}
