<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();
        $userRole = $user?->role;

        $allowed = [];
        foreach ($roles as $role) {
            $allowed[] = $role;
            if ($role === 'principal') {
                $allowed[] = 'dean';
            } elseif ($role === 'dean') {
                $allowed[] = 'principal';
            }
        }

        // Institution-wide developers can access any administrative/faculty oversight route.
        $hasStaffRole = count(array_intersect($allowed, ['dean', 'principal', 'secretary', 'teacher', 'developer'])) > 0;
        if ($hasStaffRole) {
            $allowed[] = 'developer';
        }

        if (! $user || ! in_array($userRole, $allowed, true)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized. Insufficient permissions.',
            ], 403);
        }

        return $next($request);
    }
}
