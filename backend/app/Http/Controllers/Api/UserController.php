<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\LmsAccountCreatedMail;
use App\Models\Section;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;

class UserController extends Controller
{
    public const MAX_STUDENTS_PER_SECTION = 50;

    public function index(Request $request)
    {
        $query = User::query();

        $currentUser = $request->user();
        if ($request->has('department') && !empty($request->department) && $request->department !== 'all') {
            $query->where('department', $request->department);
        } elseif ($currentUser && ! $currentUser->isInstitutionWide()) {
            $query->where('department', $currentUser->departmentCode());
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
            $search = $request->search;
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
            $query->where(function ($q) use ($department) {
                $q->where('department', $department)->orWhereNull('department');
            });
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
            $sectionAttributes = ['display_name' => $nextSection];
            if ($department && Schema::hasColumn('sections', 'department')) {
                $sectionAttributes['department'] = $department;
            }
            Section::firstOrCreate(
                ['grade' => $grade, 'name' => $nextSection],
                $sectionAttributes
            );
        }

        return $nextSection;
    }

    /**
     * Roles each account manager may create.
     * Secretary: Students & Teachers. Dean: Students, Teachers & Secretaries.
     */
    private function creatableRolesFor(?User $actor): array
    {
        $role = strtolower((string) $actor?->role);

        return match ($role) {
            'dean', 'principal', 'developer' => ['student', 'teacher', 'secretary'],
            'secretary' => ['student', 'teacher'],
            default => [],
        };
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'first_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8',
            'role' => 'required|in:student,teacher,secretary,principal,dean',
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

        $validated['department'] = !empty($validated['department'])
            ? strtoupper(trim($validated['department']))
            : ($request->user()?->departmentCode() ?? config('lms.default_department', 'CIT'));

        $validated['school_year'] = !empty($validated['school_year'])
            ? trim($validated['school_year'])
            : config('lms.school_year', '2026-2027');

        if (empty($validated['grade']) && !empty($validated['section']) && preg_match('/([1-4])[A-Z]/i', $validated['section'], $matches)) {
            $yearMap = ['1' => '1st Year', '2' => '2nd Year', '3' => '3rd Year', '4' => '4th Year'];
            $validated['grade'] = $yearMap[$matches[1]] ?? null;
        }

        if ($validated['role'] === 'student') {
            $targetGrade = !empty($validated['grade']) ? trim($validated['grade']) : '1st Year';
            $validated['grade'] = $targetGrade;
            $validated['section'] = $this->resolveAutoAssignedSection(
                $targetGrade,
                $validated['section'] ?? null,
                $validated['department']
            );
        } else {
            // Staff accounts are not enrolled into class sections
            $validated['grade'] = null;
            $validated['section'] = null;
            $validated['lrn'] = null;
        }

        $plainPassword = (string) $validated['password'];
        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = $validated['status'] ?? 'active';

        $user = User::create($validated);

        $portalOrigin = $request->headers->get('origin') ?: config('app.url', 'https://learning-lms.online');
        $accountMail = new LmsAccountCreatedMail($user, $plainPassword, $request->user(), $portalOrigin);
        $emailSent = true;
        $mailWarning = null;

        try {
            Mail::to($user->email)->send($accountMail);
        } catch (\Throwable $e) {
            $emailSent = false;
            $mailWarning = 'Account created, but live SMTP delivery encountered an issue.';
            Log::warning("Failed to dispatch account credentials email to {$user->email}: " . $e->getMessage());
        }

        \App\Models\ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'create_user',
            'description' => "Created {$user->role} account for {$user->name}" . ($user->section ? " ({$user->grade} • {$user->section})" : '') . " and dispatched credentials to {$user->email}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => "Account created and official credentials dispatched to {$user->email}.",
            'data' => $user,
            'email_dispatch' => $accountMail->toReceiptPayload($emailSent, $mailWarning),
        ], 201);
    }

    public function show(User $user)
    {
        $user->loadCount(['quizzes', 'quizAttempts']);

        return response()->json([
            'status' => 'success',
            'data' => $user
        ]);
    }

    public function update(Request $request, User $user)
    {
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'first_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'sometimes|required|string|email|max:255|unique:users,email,' . $user->id,
            'password' => 'nullable|string|min:8',
            'grade' => 'nullable|string|max:40',
            'section' => 'nullable|string|max:80',
        ]);

        if (empty($validated['grade']) && !empty($validated['section']) && preg_match('/([1-4])[A-Z]/i', $validated['section'], $matches)) {
            $yearMap = ['1' => '1st Year', '2' => '2nd Year', '3' => '3rd Year', '4' => '4th Year'];
            $validated['grade'] = $yearMap[$matches[1]] ?? null;
        }

        // Only the Dean may modify Dean/Secretary accounts; nobody edits a Dean account through this endpoint.
        $actorRole = strtolower((string) $request->user()?->role);
        $isDeanActor = in_array($actorRole, ['dean', 'principal', 'developer'], true);
        if (in_array($user->role, ['dean', 'principal'], true)
            || ($user->role === 'secretary' && ! $isDeanActor)) {
            return response()->json([
                'status' => 'error',
                'message' => 'You are not authorized to modify this account.',
            ], 403);
        }

        $previousPlacement = trim(($user->grade ?? '') . ' • ' . ($user->section ?? ''), ' •');

        // Section / Year Level reassignment for students: enforce 50-student capacity
        if ($user->role === 'student' && !empty($validated['section'])) {
            $targetSection = trim($validated['section']);
            $targetGrade = !empty($validated['grade']) ? trim($validated['grade']) : ($user->grade ?: '1st Year');

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
        } elseif ($user->role !== 'student') {
            unset($validated['grade'], $validated['section']);
        }

        if (isset($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $user->update($validated);

        $newPlacement = trim(($user->grade ?? '') . ' • ' . ($user->section ?? ''), ' •');
        $description = $user->role === 'student' && $previousPlacement !== $newPlacement
            ? "Reassigned {$user->name} from " . ($previousPlacement ?: 'Unassigned') . " to {$newPlacement}"
            : "Updated {$user->role} account details for {$user->name}";

        \App\Models\ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'update_user',
            'description' => $description,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => $description . '.',
            'data' => $user->fresh()
        ]);
    }

    public function toggleStatus(User $user, Request $request)
    {
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
        $students = User::where('role', 'student')
            ->orderBy('grade')
            ->orderBy('section')
            ->orderBy('name')
            ->get();

        return response()->json([
            'status' => 'success',
            'data' => $students
        ]);
    }
}
