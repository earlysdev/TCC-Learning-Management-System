<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Announcement;
use App\Models\LmsNotification;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AnnouncementController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $query = Announcement::with('author:id,name')->visibleTo($user);

        if ($user->isInstitutionWide()) {
            $requestedDept = $this->scopedDepartment($request);
            if ($requestedDept !== null) {
                $query->inDepartment($requestedDept);
            }
        }

        if ($user->role === 'student') {
            $query->where(function ($q): void {
                $q->whereNull('target_role')->orWhere('target_role', 'student');
            });
        } elseif ($user->role === 'teacher') {
            $query->where(function ($q): void {
                $q->whereNull('target_role')->orWhere('target_role', 'teacher');
            });
        }

        $announcements = $query->orderBy('is_pinned', 'desc')
            ->latest()
            ->paginate(15);

        return response()->json([
            'status' => 'success',
            'data' => $announcements,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $departmentKeys = array_keys(config('lms.departments', ['CIT' => 'CIT']));

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'content' => ['required', 'string'],
            'target_role' => ['nullable', 'in:student,teacher,secretary,principal,dean'],
            'department' => ['nullable', 'string', Rule::in($departmentKeys)],
            'is_pinned' => ['boolean'],
        ]);

        $user = $request->user();
        $department = $this->resolveTargetDepartment($request, $validated['department'] ?? null);
        $targetRole = $validated['target_role'] ?? null;
        if ($targetRole === 'principal') {
            $targetRole = 'dean';
        }

        $announcement = $user->announcements()->create([
            'title' => $validated['title'],
            'content' => $validated['content'],
            'target_role' => $targetRole,
            'department' => $department,
            'is_pinned' => (bool) ($validated['is_pinned'] ?? false),
        ]);

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'create_announcement',
            'description' => "Broadcasted announcement \"{$announcement->title}\" ({$department})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        $this->notifyDepartmentRecipients($announcement, $user->id);

        return response()->json([
            'status' => 'success',
            'message' => 'Announcement created successfully',
            'data' => $announcement->load('author:id,name'),
        ], 201);
    }

    public function update(Request $request, Announcement $announcement): JsonResponse
    {
        if ($denied = $this->authorizeMutation($request, $announcement)) {
            return $denied;
        }

        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'content' => ['sometimes', 'required', 'string'],
            'target_role' => ['nullable', 'in:student,teacher,secretary,principal,dean'],
            'is_pinned' => ['boolean'],
        ]);

        if (($validated['target_role'] ?? null) === 'principal') {
            $validated['target_role'] = 'dean';
        }

        $announcement->update($validated);

        return response()->json([
            'status' => 'success',
            'message' => 'Announcement updated successfully',
            'data' => $announcement->load('author:id,name'),
        ]);
    }

    public function destroy(Request $request, Announcement $announcement): JsonResponse
    {
        if ($denied = $this->authorizeMutation($request, $announcement)) {
            return $denied;
        }

        $announcement->delete();

        return response()->json([
            'status' => 'success',
            'message' => 'Announcement deleted successfully',
        ]);
    }

    private function authorizeMutation(Request $request, Announcement $announcement): ?JsonResponse
    {
        $this->ensureSameDepartment($request, $announcement->department);

        $user = $request->user();
        $canManage = $user->id === $announcement->user_id
            || $user->isInstitutionWide()
            || $user->isDeanRole()
            || $user->role === 'secretary';

        if (! $canManage) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized',
            ], 403);
        }

        return null;
    }

    private function notifyDepartmentRecipients(Announcement $announcement, int $authorId): void
    {
        $recipientQuery = User::query()
            ->where('department', $announcement->department)
            ->where('id', '!=', $authorId)
            ->where('status', 'active')
            ->where('role', '!=', 'developer');

        if ($announcement->target_role !== null) {
            $roles = $announcement->target_role === 'dean'
                ? ['dean', 'principal']
                : [$announcement->target_role];
            $recipientQuery->whereIn('role', $roles);
        }

        $now = now();
        $rows = $recipientQuery->get(['id', 'role'])->map(fn (User $recipient): array => [
            'user_id' => $recipient->id,
            'recipient_role' => $recipient->role === 'principal' ? 'dean' : $recipient->role,
            'department' => $announcement->department,
            'type' => 'announcement',
            'title' => "Announcement: {$announcement->title}",
            'message' => $announcement->content,
            'data' => json_encode(['announcement_id' => $announcement->id]),
            'is_read' => false,
            'read_at' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ])->all();

        if ($rows !== []) {
            LmsNotification::insert($rows);
        }
    }
}
