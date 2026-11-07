<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Section;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;

class UserController extends Controller
{
    public const MAX_STUDENTS_PER_SECTION = 50;

    public function index(Request $request)
    {
        $query = User::query();

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
     * Automatically find the first vacant section (< 50 students) for the given Year Level.
     * Example: If 1st Year Block - 1A has 49 students, it returns Block - 1A.
     * Once Block - 1A reaches 50 students, it moves to Block - 1B, and so on.
     */
    private function resolveAutoAssignedSection(string $grade, ?string $preferredSection = null): string
    {
        $defaultBlocksByYear = [
            '1st Year' => ['Block - 1A', 'Block - 1B', 'Block - 1C', 'Block - 1D', 'Block - 1E'],
            '2nd Year' => ['Block - 2A', 'Block - 2B', 'Block - 2C', 'Block - 2D', 'Block - 2E'],
            '3rd Year' => ['Block - 3A', 'Block - 3B', 'Block - 3C', 'Block - 3D', 'Block - 3E'],
            '4th Year' => ['Block - 4A', 'Block - 4B', 'Block - 4C', 'Block - 4D', 'Block - 4E'],
        ];

        $candidates = $defaultBlocksByYear[$grade] ?? [];

        if (Schema::hasTable('sections')) {
            $dbSections = Section::where('grade', $grade)
                ->orderBy('id')
                ->pluck('name')
                ->toArray();

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
            if (in_array($cleanPreferred, $candidates, true)) {
                $count = User::where('role', 'student')
                    ->where('section', $cleanPreferred)
                    ->count();
                if ($count < self::MAX_STUDENTS_PER_SECTION) {
                    return $cleanPreferred;
                }
            }
        }

        // Sequential assignment: pick the first section in the Year Level with < 50 students
        foreach ($candidates as $secName) {
            $count = User::where('role', 'student')
                ->where('section', $secName)
                ->count();
            if ($count < self::MAX_STUDENTS_PER_SECTION) {
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
            Section::firstOrCreate(
                ['grade' => $grade, 'name' => $nextSection],
                ['display_name' => $nextSection]
            );
        }

        return $nextSection;
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
            'school_year' => 'nullable|string|max:9',
        ]);

        if (empty($validated['grade']) && !empty($validated['section']) && preg_match('/([1-4])[A-Z]/i', $validated['section'], $matches)) {
            $yearMap = ['1' => '1st Year', '2' => '2nd Year', '3' => '3rd Year', '4' => '4th Year'];
            $validated['grade'] = $yearMap[$matches[1]] ?? null;
        }

        if ($validated['role'] === 'student') {
            $targetGrade = !empty($validated['grade']) ? trim($validated['grade']) : '1st Year';
            $validated['grade'] = $targetGrade;
            $validated['section'] = $this->resolveAutoAssignedSection($targetGrade, $validated['section'] ?? null);
        }

        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = $validated['status'] ?? 'active';

        $user = User::create($validated);

        \App\Models\ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'create_user',
            'description' => "Created {$user->role} account for {$user->name}" . ($user->section ? " ({$user->grade} • {$user->section})" : ''),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'User created successfully',
            'data' => $user
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

        if (isset($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $user->update($validated);

        return response()->json([
            'status' => 'success',
            'message' => 'User updated successfully',
            'data' => $user
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
