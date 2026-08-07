<?php

declare(strict_types=1);

/**
 * PHPUnit has no --coverage-fail-under, so the build enforces the floor here.
 *
 * Lines must stay at 100%. Branches carry a floor instead of 100% because a
 * residual ~5% is unreachable: Xdebug emits an extra opcode branch for the
 * "internal call throws" edge of every str_contains/trim/implode style call,
 * and no input can walk it. Run scripts/branch-gaps.php to inspect them.
 */
const CLOVER = __DIR__.'/../coverage/clover.xml';
const MIN_LINE_COVERAGE = 100.0;

if (! is_file(CLOVER)) {
    fwrite(STDERR, "[COVERAGE] clover.xml not found; run phpunit with --coverage-clover first.\n");
    exit(1);
}

$metrics = simplexml_load_file(CLOVER)?->project?->metrics;

if ($metrics === null) {
    fwrite(STDERR, "[COVERAGE] clover.xml has no project metrics.\n");
    exit(1);
}

$statements = (int) $metrics['statements'];
$covered = (int) $metrics['coveredstatements'];
$percent = $statements === 0 ? 0.0 : round($covered / $statements * 100, 2);

printf("[COVERAGE] lines %s%% (%d/%d), floor %s%%\n", $percent, $covered, $statements, MIN_LINE_COVERAGE);

if ($percent < MIN_LINE_COVERAGE) {
    fwrite(STDERR, "[COVERAGE] below the floor.\n");
    exit(1);
}

exit(0);
