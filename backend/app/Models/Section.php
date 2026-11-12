<?php

namespace App\Models;

use App\Models\Concerns\BelongsToDepartment;
use Illuminate\Database\Eloquent\Model;

class Section extends Model
{
    use BelongsToDepartment;

    protected $fillable = ['grade', 'name', 'display_name', 'department'];
}
