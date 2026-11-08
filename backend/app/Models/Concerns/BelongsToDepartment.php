<?php

namespace App\Models\Concerns;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Isolates records per college/department (CIT, CED, CAS, ...).
 * Only institution-wide accounts (developer) can see every department.
 */
trait BelongsToDepartment
{
    public function scopeVisibleTo(Builder $query, ?User $viewer): Builder
    {
        if ($viewer === null || $viewer->isInstitutionWide()) {
            return $query;
        }

        return $query->where($query->qualifyColumn('department'), $viewer->departmentCode());
    }

    public function scopeInDepartment(Builder $query, string $department): Builder
    {
        return $query->where($query->qualifyColumn('department'), $department);
    }

    public function isVisibleTo(?User $viewer): bool
    {
        if ($viewer === null || $viewer->isInstitutionWide()) {
            return true;
        }

        return ($this->department ?: config('lms.default_department')) === $viewer->departmentCode();
    }
}
