<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SecurityLog;
use Illuminate\Http\Request;

class SecurityLogController extends Controller
{
    public function index(Request $request)
    {
        $query = SecurityLog::with(['user:id,name,role', 'resolver:id,name']);

        if ($request->has('event_type')) {
            $query->where('event_type', $request->event_type);
        }

        if ($request->has('is_resolved')) {
            $query->where('is_resolved', $request->is_resolved === 'true' || $request->is_resolved === true || $request->is_resolved === '1');
        }

        if ($request->has('department') && !empty($request->department) && $request->department !== 'all') {
            $dept = trim((string) $request->department);
            $query->where(function ($q) use ($dept) {
                $q->whereHas('user', fn ($uq) => $uq->where('department', $dept))
                  ->orWhere('details->department', $dept);
            });
        }

        $logs = $query->latest()->paginate(50);

        return response()->json([
            'status' => 'success',
            'data' => $logs
        ]);
    }

    public function resolve(Request $request, SecurityLog $log)
    {
        $log->update([
            'is_resolved' => true,
            'resolved_at' => now(),
            'resolved_by' => $request->user()?->id,
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Security log marked as resolved',
            'data' => $log->load(['user:id,name,role', 'resolver:id,name'])
        ]);
    }

    /**
     * All-in-one resolution: resolve all pending security logs in a single action.
     */
    public function resolveAll(Request $request)
    {
        $unresolvedQuery = SecurityLog::where('is_resolved', false);
        $count = $unresolvedQuery->count();

        $unresolvedQuery->update([
            'is_resolved' => true,
            'resolved_at' => now(),
            'resolved_by' => $request->user()?->id,
        ]);

        return response()->json([
            'status' => 'success',
            'message' => "All {$count} unresolved security log(s) have been successfully resolved.",
            'resolved_count' => $count,
        ]);
    }
}
