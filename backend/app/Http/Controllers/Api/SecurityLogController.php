<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
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

        return response()->json([
            'status' => 'success',
            'data' => $query->latest()->paginate(50),
        ]);
    }

    public function resolve(Request $request, SecurityLog $log): JsonResponse
    {
        $logDepartment = $this->resolveLogDepartment($log);
        $this->ensureSameDepartment($request, $logDepartment);

        $auditor = $request->user();
        $resolvedAt = now();

        $updated = DB::transaction(fn (): int => SecurityLog::whereKey($log->id)
            ->where('is_resolved', false)
            ->update([
                'is_resolved' => true,
                'resolved_at' => $resolvedAt,
                'resolved_by' => $auditor?->id,
            ]));

        $freshLog = $log->fresh(['user:id,name,role', 'resolver:id,name']);

        if ($updated === 0) {
            return response()->json([
                'status' => 'success',
                'message' => 'Security log was already resolved.',
                'data' => $freshLog,
                'already_resolved' => true,
                'unresolved_remaining' => $this->remainingUnresolvedCount($this->scopedDepartment($request)),
            ]);
        }

        ActivityLog::create([
            'user_id' => $auditor?->id,
            'action' => 'resolve_security_log',
            'description' => "Resolved security alert #{$log->id} ({$log->event_type})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Security log marked as resolved.',
            'data' => $freshLog,
            'already_resolved' => false,
            'unresolved_remaining' => $this->remainingUnresolvedCount($this->scopedDepartment($request)),
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

        if ($department === null && $auditor?->isInstitutionWide() && ! $request->boolean('confirm_all')) {
            return response()->json([
                'status' => 'error',
                'message' => 'Specify a ?department= filter or confirm_all=true before resolving alerts across all departments.',
            ], 422);
        }

        $count = DB::transaction(function () use ($auditor, $resolvedAt, $department): int {
            $query = SecurityLog::where('is_resolved', false);
            $this->applyDepartmentFilter($query, $department);

            return $query->update([
                'is_resolved' => true,
                'resolved_at' => $resolvedAt,
                'resolved_by' => $auditor?->id,
            ]);
        });

        $remaining = $this->remainingUnresolvedCount($department);

        if ($count === 0) {
            return response()->json([
                'status' => 'success',
                'message' => 'All outstanding security alerts are already resolved.',
                'resolved_count' => 0,
                'unresolved_remaining' => $remaining,
            ]);
        }

        $auditorName = $auditor?->name ?? 'Dean';
        $scopeLabel = $department ?? 'all departments';

        ActivityLog::create([
            'user_id' => $auditor?->id,
            'action' => 'resolve_all_security_logs',
            'description' => "Batch-resolved {$count} pending security alert(s) in {$scopeLabel}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => "All {$count} pending security alert(s) resolved by {$auditorName}.",
            'resolved_count' => $count,
            'unresolved_remaining' => $remaining,
            'resolved_at' => $resolvedAt->toIso8601String(),
            'resolver' => $auditor ? ['id' => $auditor->id, 'name' => $auditor->name] : null,
        ]);
    }

    private function resolveLogDepartment(SecurityLog $log): ?string
    {
        if (is_string($log->department) && trim($log->department) !== '') {
            return strtoupper(trim($log->department));
        }

        if ($log->user) {
            return $log->user->departmentCode();
        }

        $detailDept = $log->details['department'] ?? null;

        return is_string($detailDept) && trim($detailDept) !== ''
            ? strtoupper(trim($detailDept))
            : null;
    }

    private function remainingUnresolvedCount(?string $department): int
    {
        $query = SecurityLog::where('is_resolved', false);
        $this->applyDepartmentFilter($query, $department);

        return $query->count();
    }

    private function applyDepartmentFilter(Builder $query, ?string $department): void
    {
        if ($department === null || trim($department) === '' || strtolower(trim($department)) === 'all') {
            return;
        }

        $dept = strtoupper(trim($department));
        $query->where(function (Builder $q) use ($dept): void {
            $q->where('department', $dept)
                ->orWhereHas('user', fn (Builder $uq) => $uq->where('department', $dept))
                ->orWhere('details->department', $dept);
        });
    }
}
