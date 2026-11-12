<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

abstract class Controller
{
    /**
     * Resolve the department filter for the active user.
     * Department-bound roles (Dean, Secretary, Teacher, Student) are always locked to their own department.
     * Institution-wide accounts (developer) may optionally filter by `?department=`.
     */
    protected function scopedDepartment(Request $request, bool $allowRequestFilter = true): ?string
    {
        $user = $request->user();
        if ($user && ! $user->isInstitutionWide()) {
            return $user->departmentCode();
        }

        if (! $allowRequestFilter) {
            return null;
        }

        $requested = $request->input('department');
        if (! is_string($requested) || trim($requested) === '' || strtolower(trim($requested)) === 'all') {
            return null;
        }

        return strtoupper(trim($requested));
    }

    /**
     * Determine the department assigned to a newly created or updated record.
     * Non-institution-wide accounts cannot assign records outside their own department.
     */
    protected function resolveTargetDepartment(Request $request, ?string $requested = null): string
    {
        $user = $request->user();
        if ($user && ! $user->isInstitutionWide()) {
            return $user->departmentCode();
        }

        if (is_string($requested) && trim($requested) !== '') {
            return strtoupper(trim($requested));
        }

        return $user?->departmentCode() ?? (string) config('lms.default_department', 'CIT');
    }

    /**
     * Abort with 403 if a department-bound user attempts to touch another department's (or unattributed) record.
     */
    protected function ensureSameDepartment(Request $request, ?string $resourceDepartment): void
    {
        $user = $request->user();
        if ($user === null || $user->isInstitutionWide()) {
            return;
        }

        $targetDept = is_string($resourceDepartment) ? strtoupper(trim($resourceDepartment)) : '';
        abort_unless(
            $targetDept !== '' && strcasecmp($user->departmentCode(), $targetDept) === 0,
            403,
            'You may only access records within your assigned department.'
        );
    }
}
