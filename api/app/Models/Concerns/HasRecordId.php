<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use App\Support\RecordId;

/**
 * Keeps the 24 hexadecimal character identifiers the HTTP contract exposes.
 */
trait HasRecordId
{
    /**
     * Declared as properties, not set in an initializer: a runtime assignment is
     * invisible to static analysis, which then reads every `$model->id` as the
     * int of an auto-increment key.
     */
    public $incrementing = false;

    protected $keyType = 'string';

    protected static function bootHasRecordId(): void
    {
        static::creating(function (self $model): void {
            if (! $model->getKey()) {
                $model->setAttribute($model->getKeyName(), RecordId::generate());
            }
        });
    }
}
