<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $userRole = $request->user()?->role;
        $allowed = [];
        foreach ($roles as $r) {
            $allowed[] = $r;
            if ($r === 'principal') $allowed[] = 'dean';
            if ($r === 'dean') $allowed[] = 'principal';
        }

        if (!$request->user() || !in_array($userRole, $allowed)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized. Insufficient permissions.'
            ], 403);
        }

        return $next($request);
    }
}
