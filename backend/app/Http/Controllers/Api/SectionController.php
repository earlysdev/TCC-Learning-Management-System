<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Section;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SectionController extends Controller
{
    private function ensureDefaultBlocksSeeded(string $department): void
    {
        if (Section::where('department', $department)->exists()) {
            return;
        }

        $yearBlocks = [
            '1st Year' => ['Block - 1A', 'Block - 1B', 'Block - 1C', 'Block - 1D', 'Block - 1E'],
            '2nd Year' => ['Block - 2A', 'Block - 2B', 'Block - 2C', 'Block - 2D', 'Block - 2E'],
            '3rd Year' => ['Block - 3A', 'Block - 3B', 'Block - 3C', 'Block - 3D', 'Block - 3E'],
            '4th Year' => ['Block - 4A', 'Block - 4B', 'Block - 4C', 'Block - 4D', 'Block - 4E'],
        ];

        foreach ($yearBlocks as $yearLevel => $blocks) {
            foreach ($blocks as $blockName) {
                Section::updateOrCreate(
                    ['department' => $department, 'grade' => $yearLevel, 'name' => $blockName],
                    [
                        'department' => $department,
                        'grade' => $yearLevel,
                        'name' => $blockName,
                        'display_name' => $blockName,
                    ]
                );
            }
        }
    }

    public function index(Request $request): JsonResponse
    {
        $department = $this->scopedDepartment($request);
        $seedDept = $department ?? ($request->user()?->departmentCode() ?? config('lms.default_department', 'CIT'));
        $this->ensureDefaultBlocksSeeded($seedDept);

        $query = Section::query();
        $studentsQuery = User::where('role', 'student')->whereNotNull('section');

        if ($department !== null) {
            $query->where('department', $department);
            $studentsQuery->where('department', $department);
        }

        if ($request->has('grade') && !empty($request->grade)) {
            $query->where('grade', $request->grade);
        }

        $sections = $query->orderBy('grade')->orderBy('name')->get();

        $studentsBySection = $studentsQuery
            ->selectRaw('section, count(*) as count')
            ->groupBy('section')
            ->pluck('count', 'section');

        $enriched = $sections->map(function (Section $section) use ($studentsBySection) {
            $count = (int) ($studentsBySection->get($section->name)
                ?? $studentsBySection->get($section->display_name)
                ?? 0);

            return [
                'id' => $section->id,
                'grade' => $section->grade,
                'name' => $section->name,
                'display_name' => $section->display_name ?: $section->name,
                'student_count' => $count,
                'students_count' => $count,
                'created_at' => $section->created_at,
            ];
        });

        return response()->json([
            'status' => 'success',
            'sections' => $enriched,
            'data' => $enriched,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'grade' => ['required', 'string', 'max:40'],
            'name' => ['required', 'string', 'max:80'],
            'display_name' => ['nullable', 'string', 'max:100'],
            'department' => ['nullable', 'string', 'max:16'],
        ]);

        $department = $this->resolveTargetDepartment($request, $validated['department'] ?? null);
        $this->ensureDefaultBlocksSeeded($department);

        $grade = trim($validated['grade']);
        $rawName = trim($validated['name']);

        // Normalize short block codes like "1F" or "2F" into "Block - 1F"
        if (preg_match('/^([1-4][A-Z])$/i', $rawName, $matches)) {
            $name = 'Block - ' . strtoupper($matches[1]);
        } elseif (preg_match('/^block\s*[-:]?\s*([1-4][A-Z0-9-]+)$/i', $rawName, $matches)) {
            $name = 'Block - ' . strtoupper($matches[1]);
        } else {
            $name = $rawName;
        }

        // Check if section already exists within this department and grade
        $exists = Section::where('department', $department)
            ->where('grade', $grade)
            ->whereRaw('LOWER(name) = ?', [strtolower($name)])
            ->exists();

        if ($exists) {
            return response()->json([
                'status' => 'error',
                'message' => "Section '{$name}' already exists under {$grade}.",
            ], 422);
        }

        $displayName = !empty($validated['display_name'])
            ? trim($validated['display_name'])
            : $name;

        $section = Section::create([
            'grade' => $grade,
            'name' => $name,
            'display_name' => $displayName,
            'department' => $department,
        ]);

        ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'create_section',
            'description' => "Created class section '{$section->name}' under {$section->grade}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => "Section '{$section->name}' successfully created for {$section->grade}.",
            'section' => [
                'id' => $section->id,
                'grade' => $section->grade,
                'name' => $section->name,
                'display_name' => $section->display_name,
                'student_count' => 0,
                'students_count' => 0,
            ],
            'data' => $section,
        ], 201);
    }

    public function update(Request $request, Section $section): JsonResponse
    {
        $this->ensureSameDepartment($request, $section->department);

        $validated = $request->validate([
            'grade' => ['required', 'string', 'max:40'],
            'name' => ['required', 'string', 'max:80'],
            'display_name' => ['nullable', 'string', 'max:100'],
            'department' => ['nullable', 'string', 'max:16'],
        ]);

        $department = $section->department ?: $this->resolveTargetDepartment($request, $validated['department'] ?? null);

        $grade = trim($validated['grade']);
        $rawName = trim($validated['name']);

        if (preg_match('/^([1-4][A-Z])$/i', $rawName, $matches)) {
            $name = 'Block - ' . strtoupper($matches[1]);
        } elseif (preg_match('/^block\s*[-:]?\s*([1-4][A-Z0-9-]+)$/i', $rawName, $matches)) {
            $name = 'Block - ' . strtoupper($matches[1]);
        } else {
            $name = $rawName;
        }

        $duplicate = Section::where('id', '!=', $section->id)
            ->where('department', $department)
            ->where('grade', $grade)
            ->whereRaw('LOWER(name) = ?', [strtolower($name)])
            ->exists();

        if ($duplicate) {
            return response()->json([
                'status' => 'error',
                'message' => "Section '{$name}' already exists under {$grade}.",
            ], 422);
        }

        $oldName = $section->name;
        $displayName = !empty($validated['display_name'])
            ? trim($validated['display_name'])
            : $name;

        $section->update([
            'grade' => $grade,
            'name' => $name,
            'display_name' => $displayName,
        ]);

        if ($oldName !== $name) {
            User::where('role', 'student')
                ->where('department', $department)
                ->where('section', $oldName)
                ->update([
                    'section' => $name,
                    'grade' => $grade,
                ]);
        }

        ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'update_section',
            'description' => "Updated class section '{$oldName}' to '{$section->name}' ({$section->grade})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => "Section updated to '{$section->name}' ({$section->grade}).",
            'section' => $section,
            'data' => $section,
        ]);
    }

    public function destroy(Request $request, Section $section): JsonResponse
    {
        $this->ensureSameDepartment($request, $section->department);

        $grade = $section->grade;
        $name = $section->name;
        $department = $section->department ?: config('lms.default_department', 'CIT');

        // Check if students are currently enrolled in this section within the same department
        $enrolledCount = User::where('role', 'student')
            ->where('department', $department)
            ->where(function ($q) use ($name, $section) {
                $q->where('section', $name);
                if (!empty($section->display_name)) {
                    $q->orWhere('section', $section->display_name);
                }
            })
            ->count();

        if ($enrolledCount > 0) {
            return response()->json([
                'status' => 'error',
                'message' => "Cannot remove section '{$name}' because {$enrolledCount} active student(s) are currently assigned to it. Please reassign the students first.",
            ], 422);
        }

        $section->delete();

        ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'delete_section',
            'description' => "Removed class section '{$name}' from {$grade}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => "Section '{$name}' has been successfully removed from {$grade}.",
        ]);
    }
}
