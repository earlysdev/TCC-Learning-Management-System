<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ActivityLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = ActivityLog::with('user:id,name,role,department');

        $department = $this->scopedDepartment($request);
        if ($department !== null) {
            $query->whereHas('user', fn ($q) => $q->where('department', $department));
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', (int) $request->input('user_id'));
        }

        if ($request->filled('action')) {
            $escaped = addcslashes(trim((string) $request->input('action')), '%_\\');
            $query->where('action', 'like', "%{$escaped}%");
        }

        if ($request->filled('start_date') && $request->filled('end_date')) {
            try {
                $start = Carbon::parse((string) $request->input('start_date'))->startOfDay();
                $end = Carbon::parse((string) $request->input('end_date'))->endOfDay();
                $query->whereBetween('created_at', [$start, $end]);
            } catch (\Throwable) {
                // Ignore invalid date filter strings gracefully
            }
        }

        return response()->json([
            'status' => 'success',
            'data' => $query->latest()->paginate(20),
        ]);
    }
}
