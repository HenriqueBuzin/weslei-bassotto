<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\HasRecordId;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $name
 * @property string|null $description
 */
class Role extends Model
{
    use HasRecordId;

    public $timestamps = false;

    protected $fillable = ['name', 'description'];
}
