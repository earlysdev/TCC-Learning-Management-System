<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SecurityLog;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SecurityLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = SecurityLog::with(['user:id,name,role', 'resolver:id,name']);

        if ($request->filled('event_type')) {
            $query->where('event_type', trim((string) $request->input('event_type')));
        }

        if ($request->has('is_resolved')) {
            $isResolved = filter_var($request->input('is_resolved'), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($isResolved !== null) {
                $query->where('is_resolved', $isResolved);
            }
        }

        $this->applyDepartmentFilter($query, $this->scopedDepartment($request));

        $logs = $query->latest()->paginate(50);

        return response()->json([
            'status' => 'success',
            'data' => $logs,
        ]);
    }

    public function resolve(Request $request, SecurityLog $log): JsonResponse
    {
        $logDepartment = $log->user?->departmentCode()
            ?? (is_string($log->details['department'] ?? null) ? $log->details['department'] : null);
        if ($logDepartment !== null) {
            $this->ensureSameDepartment($request, $logDepartment);
        }

        if ($log->is_resolved) {
            return response()->json([
                'status' => 'success',
                'message' => 'Security log was already resolved.',
                'data' => $log->load(['user:id,name,role', 'resolver:id,name']),
            ]);
        }

        $log->update([
            'is_resolved' => true,
            'resolved_at' => now(),
            'resolved_by' => $request->user()?->id,
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Security log marked as resolved.',
            'data' => $log->fresh(['user:id,name,role', 'resolver:id,name']),
        ]);
    }

    /**
     * Batch resolution for all outstanding security alerts in the Dean's department with auditor attribution.
     */
    public function resolveAll(Request $request): JsonResponse
    {
        $auditor = $request->user();
        $resolvedAt = now();
        $department = $this->scopedDepartment($request);

        $count = DB::transaction(function () use ($auditor, $resolvedAt, $department): int {
            $query = SecurityLog::where('is_resolved', false);
            $this->applyDepartmentFilter($query, $department);

            return $query->update([
                'is_resolved' => true,
                'resolved_at' => $resolvedAt,
                'resolved_by' => $auditor?->id,
            ]);
        });

        if ($count === 0) {
            return response()->json([
                'status' => 'success',
                'message' => 'All outstanding security alerts are already resolved.',
                'resolved_count' => 0,
            ]);
        }

        $auditorName = $auditor?->name ?? 'Dean';

        return response()->json([
            'status' => 'success',
            'message' => "All {$count} pending security alert(s) resolved by {$auditorName}.",
            'resolved_count' => $count,
            'resolved_at' => $resolvedAt->toIso8601String(),
            'resolver' => $auditor ? ['id' => $auditor->id, 'name' => $auditor->name] : null,
        ]);
    }

    private function applyDepartmentFilter(Builder $query, ?string $department): void
    {
        if ($department === null || trim($department) === '' || strtolower(trim($department)) === 'all') {
            return;
        }

        $dept = trim($department);
        $query->where(function (Builder $q) use ($dept): void {
            $q->whereHas('user', fn (Builder $uq) => $uq->where('department', $dept))
                ->orWhere('details->department', $dept);
        });
    }
}
