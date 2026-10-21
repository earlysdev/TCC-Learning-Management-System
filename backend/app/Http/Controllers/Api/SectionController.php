<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Section;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SectionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Section::query();

        if ($request->has('grade') && !empty($request->grade)) {
            $query->where('grade', $request->grade);
        }

        $sections = $query->orderBy('grade')->orderBy('name')->get();

        // Attach student counts per section
        $studentCounts = User::where('role', 'student')
            ->selectRaw('grade, section, count(*) as count')
            ->groupBy('grade', 'section')
            ->get()
            ->keyBy(fn ($item) => "{$item->grade}___{$item->section}");

        $enriched = $sections->map(function (Section $section) use ($studentCounts) {
            $key = "{$section->grade}___{$section->name}";
            $count = $studentCounts->get($key)?->count ?? 0;
            return [
                'id' => $section->id,
                'grade' => $section->grade,
                'name' => $section->name,
                'display_name' => $section->display_name ?: "{$section->grade} - {$section->name}",
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
            'grade' => ['required', 'string', 'max:30'],
            'name' => ['required', 'string', 'max:60'],
            'display_name' => ['nullable', 'string', 'max:80'],
        ]);

        $grade = trim($validated['grade']);
        $name = trim($validated['name']);

        // Check if section already exists for this grade
        $exists = Section::where('grade', $grade)
            ->whereRaw('LOWER(name) = ?', [strtolower($name)])
            ->exists();

        if ($exists) {
            return response()->json([
                'status' => 'error',
                'message' => "Section '{$name}' already exists in {$grade}.",
            ], 422);
        }

        $displayName = !empty($validated['display_name'])
            ? trim($validated['display_name'])
            : "{$grade} - {$name}";

        $section = Section::create([
            'grade' => $grade,
            'name' => $name,
            'display_name' => $displayName,
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

    public function destroy(Section $section): JsonResponse
    {
        $grade = $section->grade;
        $name = $section->name;

        // Check if students are currently enrolled in this section
        $enrolledCount = User::where('role', 'student')
            ->where('grade', $grade)
            ->where('section', $name)
            ->count();

        if ($enrolledCount > 0) {
            return response()->json([
                'status' => 'error',
                'message' => "Cannot remove section '{$name}' because {$enrolledCount} active student(s) are currently assigned to it. Please reassign the students first.",
            ], 422);
        }

        $section->delete();

        return response()->json([
            'status' => 'success',
            'message' => "Section '{$name}' has been successfully removed from {$grade}.",
        ]);
    }
}
