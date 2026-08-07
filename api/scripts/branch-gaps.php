<?php

declare(strict_types=1);
use SebastianBergmann\CodeCoverage\CodeCoverage;

// Dumps every branch Xdebug saw but no test entered, with its line range.
require __DIR__.'/../vendor/autoload.php';

/** @var CodeCoverage $coverage */
$coverage = require __DIR__.'/../coverage/coverage.php';

function readProperty(object $object, string $name): mixed
{
    $property = new ReflectionProperty($object, $name);

    return $property->getValue($object);
}

foreach ($coverage->getData()->functionCoverage() as $file => $functions) {
    $short = str_replace('/app/', '', $file);
    $lines = file($file);
    $rows = [];

    foreach ($functions as $function => $data) {
        foreach (readProperty($data, 'branches') as $branch) {
            if (readProperty($branch, 'hit') !== []) {
                continue;
            }

            $start = readProperty($branch, 'line_start');
            $end = readProperty($branch, 'line_end');
            $text = trim($lines[$start - 1] ?? '');
            $rows[] = sprintf('  L%-9s %-42s %s', "{$start}-{$end}", $function, $text);
        }
    }

    if ($rows !== []) {
        echo "\n=== {$short}\n".implode("\n", $rows)."\n";
    }
}
