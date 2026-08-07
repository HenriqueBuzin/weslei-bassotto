<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $label
 * @property string $type
 * @property array<int, string> $options
 * @property bool $required
 * @property bool $active
 * @property int $position
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class ConsultancyQuestion extends Model
{
    use HasRecordId;

    protected $fillable = ['label', 'type', 'options', 'required', 'active', 'position'];

    protected function casts(): array
    {
        return [
            'options' => 'array',
            'required' => 'boolean',
            'active' => 'boolean',
            'position' => 'integer',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * @param  Builder<ConsultancyQuestion>  $query
     * @return Builder<ConsultancyQuestion>
     */
    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('position')->orderBy('created_at');
    }
}
