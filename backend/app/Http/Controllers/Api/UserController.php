<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\LmsAccountCreatedMail;
use App\Models\Section;
use App\Models\User;
use App\Services\LmsMailService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class UserController extends Controller
{
    public const MAX_STUDENTS_PER_SECTION = 50;

    public function index(Request $request)
    {
        $query = User::query();

        $department = $this->scopedDepartment($request);
        if ($department !== null) {
            $query->where('department', $department);
        }

        if ($request->has('role') && $request->filled('role')) {
            $roleParam = trim((string) $request->role);
            if ($roleParam === 'staff') {
                $query->whereIn('role', ['teacher', 'secretary']);
            } elseif (str_contains($roleParam, ',')) {
                $roles = array_filter(array_map('trim', explode(',', $roleParam)));
                $query->whereIn('role', $roles);
            } else {
                $query->byRole($roleParam);
            }
        }

        if ($request->boolean('exclude_dean')) {
            $query->whereNotIn('role', ['dean', 'principal']);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('grade')) {
            $query->where('grade', $request->grade);
        }

        if ($request->has('section')) {
            $query->where('section', $request->section);
        }

        if ($request->has('search')) {
            $search = addcslashes(trim((string) $request->search), '%_\\');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('lrn', 'like', "%{$search}%");
            });
        }

        $perPage = (int) $request->input('per_page', 500);
        $users = $query->orderByDesc('id')->paginate(max(15, min($perPage, 1000)));

        return response()->json([
            'status' => 'success',
            'data' => $users
        ]);
    }

    /**
     * Count enrolled students in a section within the same department (department-isolated capacity).
     */
    private function countStudentsInSection(string $section, ?string $department = null, ?int $excludeUserId = null): int
    {
        $query = User::where('role', 'student')->where('section', $section);

        if ($department) {
            $query->where('department', $department);
        }

        if ($excludeUserId) {
            $query->where('id', '!=', $excludeUserId);
        }

        return $query->count();
    }

    /**
     * Automatically find the first vacant section (< 50 students) for the given Year Level.
     * Example: If 1st Year Block - 1A has 49 students, it returns Block - 1A.
     * Once Block - 1A reaches 50 students, it moves to Block - 1B, and so on.
     */
    private function resolveAutoAssignedSection(string $grade, ?string $preferredSection = null, ?string $department = null): string
    {
        $defaultBlocksByYear = [
            '1st Year' => ['Block - 1A', 'Block - 1B', 'Block - 1C', 'Block - 1D', 'Block - 1E'],
            '2nd Year' => ['Block - 2A', 'Block - 2B', 'Block - 2C', 'Block - 2D', 'Block - 2E'],
            '3rd Year' => ['Block - 3A', 'Block - 3B', 'Block - 3C', 'Block - 3D', 'Block - 3E'],
            '4th Year' => ['Block - 4A', 'Block - 4B', 'Block - 4C', 'Block - 4D', 'Block - 4E'],
        ];

        $candidates = $defaultBlocksByYear[$grade] ?? [];

        if (Schema::hasTable('sections')) {
            $sectionQuery = Section::where('grade', $grade);
            if ($department && Schema::hasColumn('sections', 'department')) {
                $sectionQuery->where(function ($q) use ($department) {
                    $q->where('department', $department)->orWhereNull('department');
                });
            }
            $dbSections = $sectionQuery->orderBy('id')->pluck('name')->toArray();

            foreach ($dbSections as $secName) {
                $clean = trim((string) $secName);
                if ($clean !== '' && !in_array($clean, $candidates, true)) {
                    $candidates[] = $clean;
                }
            }
        }

        // If a preferred section was passed and belongs to this Year Level and still has < 50 students, allow it
        if ($preferredSection && strtolower(trim($preferredSection)) !== 'auto') {
            $cleanPreferred = trim($preferredSection);
            if (in_array($cleanPreferred, $candidates, true)
                && $this->countStudentsInSection($cleanPreferred, $department) < self::MAX_STUDENTS_PER_SECTION) {
                return $cleanPreferred;
            }
        }

        // Sequential assignment: pick the first section in the Year Level with < 50 students
        foreach ($candidates as $secName) {
            if ($this->countStudentsInSection($secName, $department) < self::MAX_STUDENTS_PER_SECTION) {
                return $secName;
            }
        }

        // All existing sections are at 50/50 capacity -> generate the next Block letter automatically
        $yearNum = '1';
        if (preg_match('/([1-9])/', $grade, $m)) {
            $yearNum = $m[1];
        }

        $usedLetters = [];
        foreach ($candidates as $blk) {
            if (preg_match('/' . preg_quote($yearNum, '/') . '([A-Z])/i', $blk, $lm)) {
                $usedLetters[strtoupper($lm[1])] = true;
            }
        }

        $nextSection = null;
        for ($code = 65; $code <= 90; $code++) {
            $letter = chr($code);
            if (!isset($usedLetters[$letter])) {
                $nextSection = "Block - {$yearNum}{$letter}";
                break;
            }
        }

        if (!$nextSection) {
            $nextSection = "Block - {$yearNum}" . (count($candidates) + 1);
        }

        if (Schema::hasTable('sections')) {
            $lookup = ['grade' => $grade, 'name' => $nextSection];
            $sectionAttributes = ['display_name' => $nextSection];
            if ($department && Schema::hasColumn('sections', 'department')) {
                $lookup['department'] = $department;
                $sectionAttributes['department'] = $department;
            }
            Section::firstOrCreate($lookup, $sectionAttributes);
        }

        return $nextSection;
    }

    /**
     * Roles each account manager may create within their scope.
     * Secretary: Students & Teachers. Dean: Students, Teachers & Secretaries.
     * Developer: Institution-wide provisioning including 1 Dean per department.
     */
    private function creatableRolesFor(?User $actor): array
    {
        $role = strtolower((string) $actor?->role);

        return match ($role) {
            'developer' => ['student', 'teacher', 'secretary', 'dean'],
            'dean', 'principal' => ['student', 'teacher', 'secretary'],
            'secretary' => ['student', 'teacher'],
            default => [],
        };
    }

    /**
     * Enforce both department boundaries and role hierarchy before modifying/toggling an account.
     */
    private function authorizeUserMutation(Request $request, User $target): ?JsonResponse
    {
        $this->ensureSameDepartment($request, $target->departmentCode());

        $actor = $request->user();
        $isDev = $actor !== null && $actor->isInstitutionWide();
        $isDeanOrDev = $actor !== null && ($actor->isDeanRole() || $isDev);

        if ($target->isInstitutionWide() && ! $isDev) {
            return response()->json([
                'status' => 'error',
                'message' => 'You are not authorized to modify this account.',
            ], 403);
        }

        if (($target->isDeanRole() && ! $isDev) || ($target->role === 'secretary' && ! $isDeanOrDev)) {
            return response()->json([
                'status' => 'error',
                'message' => 'You are not authorized to modify this account.',
            ], 403);
        }

        return null;
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'first_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8',
            'role' => 'required|in:student,teacher,secretary,dean',
            'lrn' => 'nullable|string|unique:users',
            'grade' => 'nullable|string|max:40',
            'section' => 'nullable|string|max:80',
            'department' => 'nullable|string|max:16',
            'school_year' => 'nullable|string|max:9',
        ]);

        $allowedRoles = $this->creatableRolesFor($request->user());
        if (! in_array($validated['role'], $allowedRoles, true)) {
            return response()->json([
                'status' => 'error',
                'message' => 'You are not authorized to create a ' . $validated['role'] . ' account.',
            ], 403);
        }

        $validated['department'] = $this->resolveTargetDepartment($request, $validated['department'] ?? null);

        $validated['school_year'] = !empty($validated['school_year'])
            ? trim($validated['school_year'])
            : config('lms.school_year', '2026-2027');

        if ($validated['role'] === 'student') {
            $validated['grade'] = User::normalizeYearLevel($validated['grade'] ?? null, $validated['section'] ?? null) ?? '1st Year';
        } elseif ($validated['role'] === 'teacher') {
            $validated['grade'] = User::normalizeYearLevel($validated['grade'] ?? null);
            $validated['section'] = null;
            $validated['lrn'] = null;
        } else {
            // Administrative staff accounts are not enrolled into class sections or year levels
            $validated['grade'] = null;
            $validated['section'] = null;
            $validated['lrn'] = null;
        }

        $plainPassword = (string) $validated['password'];
        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = 'active';

        // Enforce single-Dean-per-department and 50-student section cap atomically
        try {
            $user = DB::transaction(function () use ($validated): ?User {
                if (in_array($validated['role'], ['dean', 'principal'], true)) {
                    $deanExists = User::where('department', $validated['department'])
                        ->whereIn('role', ['dean', 'principal'])
                        ->lockForUpdate()
                        ->exists();
                    if ($deanExists) {
                        return null;
                    }
                } elseif ($validated['role'] === 'student') {
                    if (Schema::hasTable('sections')) {
                        Section::where('grade', $validated['grade'])
                            ->where('department', $validated['department'])
                            ->lockForUpdate()
                            ->get();
                    }
                    $validated['section'] = $this->resolveAutoAssignedSection(
                        $validated['grade'],
                        $validated['section'] ?? null,
                        $validated['department']
                    );
                }

                return User::create($validated);
            });
        } catch (\Illuminate\Database\QueryException $e) {
            $user = null;
        }

        if ($user === null) {
            return response()->json([
                'status' => 'error',
                'message' => "The {$validated['department']} department already has an assigned Dean. Only 1 Dean exists per department.",
            ], 422);
        }

        $portalOrigin = $request->headers->get('origin') ?: config('app.frontend_url', config('app.url'));
        $accountMail = new LmsAccountCreatedMail($user, $plainPassword, $request->user(), $portalOrigin);
        $dispatch = LmsMailService::dispatch($user->email, $accountMail, 'account creation credentials');

        $message = match ($dispatch['status']) {
            'sent' => "Account created and official credentials dispatched to {$user->email}.",
            'simulated' => "Account created, but mail is in '{$dispatch['mailer']}' log mode (written to server log instead of {$user->email}).",
            default => "Account created, but live SMTP email delivery to {$user->email} failed.",
        };

        $placementSummary = $user->section
            ? " ({$user->grade} • {$user->section})"
            : ($user->role === 'teacher' && $user->yearLevelLabel() ? " (Handles {$user->yearLevelLabel()})" : '');

        \App\Models\ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'create_user',
            'description' => "Created {$user->role} account for {$user->name}{$placementSummary} ({$dispatch['status']} mail to {$user->email})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => $message,
            'data' => $user,
            'email_dispatch' => $accountMail->toReceiptPayload(
                $dispatch['sent'],
                $dispatch['warning'],
                $dispatch['status'],
                $dispatch['simulated']
            ),
        ], 201);
    }

    public function show(Request $request, User $user)
    {
        $this->ensureSameDepartment($request, $user->departmentCode());

        $user->loadCount(['quizzes', 'quizAttempts']);

        return response()->json([
            'status' => 'success',
            'data' => $user
        ]);
    }

    public function update(Request $request, User $user)
    {
        if ($denied = $this->authorizeUserMutation($request, $user)) {
            return $denied;
        }

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'first_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'sometimes|required|string|email|max:255|unique:users,email,' . $user->id,
            'password' => 'nullable|string|min:8',
            'grade' => 'nullable|string|max:40',
            'section' => 'nullable|string|max:80',
        ]);

        if ($user->role === 'student') {
            $normalizedStudentGrade = User::normalizeYearLevel($validated['grade'] ?? null, $validated['section'] ?? null);
            if ($normalizedStudentGrade !== null && empty($validated['grade'])) {
                $validated['grade'] = $normalizedStudentGrade;
            }
        }

        $previousPlacement = $user->role === 'teacher'
            ? ($user->yearLevelLabel() ?: 'All Year Levels')
            : trim(($user->grade ?? '') . ' • ' . ($user->section ?? ''), ' •');

        // Section / Year Level reassignment for students: enforce 50-student capacity and keep grade/section aligned
        $gradeChanged = !empty($validated['grade']) && strcasecmp(trim($validated['grade']), (string) $user->grade) !== 0;
        if ($user->role === 'student' && (!empty($validated['section']) || $gradeChanged)) {
            $targetGrade = User::normalizeYearLevel($validated['grade'] ?? null, $validated['section'] ?? null)
                ?? ($user->grade ?: '1st Year');
            $targetSection = !empty($validated['section']) ? trim($validated['section']) : 'auto';

            if (strtolower($targetSection) === 'auto') {
                $targetSection = $this->resolveAutoAssignedSection($targetGrade, null, $user->department);
            } elseif (strcasecmp($targetSection, (string) $user->section) !== 0) {
                $occupied = $this->countStudentsInSection($targetSection, $user->department, $user->id);
                if ($occupied >= self::MAX_STUDENTS_PER_SECTION) {
                    return response()->json([
                        'status' => 'error',
                        'message' => "{$targetSection} is already at full capacity ({$occupied}/" . self::MAX_STUDENTS_PER_SECTION . '). Please choose another section.',
                    ], 422);
                }
            }

            $validated['section'] = $targetSection;
            $validated['grade'] = $targetGrade;
        } elseif ($user->role === 'teacher') {
            unset($validated['section']);
            if ($request->exists('grade')) {
                $validated['grade'] = User::normalizeYearLevel($validated['grade'] ?? null);
            }
        } elseif ($user->role !== 'student') {
            unset($validated['grade'], $validated['section']);
        }

        $plainPasswordForMail = null;
        if (isset($validated['password']) && trim((string) $validated['password']) !== '') {
            $plainPasswordForMail = (string) $validated['password'];
            $validated['password'] = Hash::make($plainPasswordForMail);
        } else {
            unset($validated['password']);
        }

        $user->update($validated);

        if ($plainPasswordForMail !== null) {
            $user->tokens()->delete();
        }

        $newPlacement = $user->role === 'teacher'
            ? ($user->yearLevelLabel() ?: 'All Year Levels')
            : trim(($user->grade ?? '') . ' • ' . ($user->section ?? ''), ' •');
        $description = ($user->role === 'student' || $user->role === 'teacher') && $previousPlacement !== $newPlacement
            ? ($user->role === 'teacher'
                ? "Assigned {$user->name} to handle {$newPlacement} (was {$previousPlacement})"
                : "Reassigned {$user->name} from " . ($previousPlacement ?: 'Unassigned') . " to {$newPlacement}")
            : "Updated {$user->role} account details for {$user->name}";

        \App\Models\ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'update_user',
            'description' => $description,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        $emailDispatch = null;
        if ($plainPasswordForMail !== null) {
            $portalOrigin = $request->headers->get('origin') ?: config('app.frontend_url', config('app.url'));
            $accountMail = new LmsAccountCreatedMail($user, $plainPasswordForMail, $request->user(), $portalOrigin);
            $dispatch = LmsMailService::dispatch($user->email, $accountMail, 'updated account credentials');
            $emailDispatch = $accountMail->toReceiptPayload(
                $dispatch['sent'],
                $dispatch['warning'],
                $dispatch['status'],
                $dispatch['simulated']
            );
            $description .= match ($dispatch['status']) {
                'sent' => " Credentials emailed to {$user->email}",
                'simulated' => " (Credentials written to '{$dispatch['mailer']}' server log only)",
                default => " (SMTP email delivery to {$user->email} failed)",
            };
        }

        return response()->json([
            'status' => 'success',
            'message' => $description . '.',
            'data' => $user->fresh(),
            ...($emailDispatch !== null ? ['email_dispatch' => $emailDispatch] : []),
        ]);
    }

    public function toggleStatus(User $user, Request $request)
    {
        if ($denied = $this->authorizeUserMutation($request, $user)) {
            return $denied;
        }

        $validated = $request->validate([
            'status' => 'required|in:active,inactive,graduated'
        ]);

        $user->update(['status' => $validated['status']]);

        \App\Models\ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'update_user_status',
            'description' => "Changed {$user->name}'s status to {$validated['status']}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'User status updated successfully',
            'data' => $user
        ]);
    }

    public function teacherStudents(Request $request)
    {
        $query = User::where('role', 'student');

        $department = $this->scopedDepartment($request, false);
        if ($department !== null) {
            $query->where('department', $department);
        }

        $actor = $request->user();
        $handledYearLevel = $actor?->role === 'teacher' ? $actor->yearLevelLabel() : null;
        if ($handledYearLevel !== null) {
            $query->forYearLevel($handledYearLevel);
        }

        $students = $query
            ->orderBy('grade')
            ->orderBy('section')
            ->orderBy('name')
            ->limit(min(500, max(1, (int) $request->input('limit', 500))))
            ->get(['id', 'name', 'email', 'lrn', 'role', 'grade', 'section', 'department', 'status']);

        return response()->json([
            'status' => 'success',
            'handled_year_level' => $handledYearLevel,
            'data' => $students
        ]);
    }
}
