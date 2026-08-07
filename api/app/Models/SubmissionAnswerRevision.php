<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property string $id
 * @property string $submission_id
 * @property array<int, array<string, mixed>> $answers
 * @property Carbon $changed_at
 * @property string $changed_by
 */
class SubmissionAnswerRevision extends Model
{
    use HasRecordId;

    public $timestamps = false;

    protected $fillable = ['submission_id', 'answers', 'changed_at', 'changed_by'];

    protected function casts(): array
    {
        return [
            'answers' => 'array',
            'changed_at' => 'datetime',
        ];
    }
}
