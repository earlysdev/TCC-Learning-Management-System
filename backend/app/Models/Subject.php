<?php

namespace App\Models;

use App\Models\Concerns\BelongsToDepartment;
use Illuminate\Database\Eloquent\Model;

class Subject extends Model
{
    use BelongsToDepartment;

    protected $fillable = [
        'name',
        'code',
        'grade',
        'department',
        'description',
    ];
}
