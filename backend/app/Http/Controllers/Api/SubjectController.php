<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Quiz;
use App\Models\Subject;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubjectController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Subject::query();

        if ($request->filled('grade') && $request->grade !== 'all' && $request->grade !== 'All Grades') {
            $query->where(function ($q) use ($request) {
                $q->where('grade', $request->grade)
                  ->orWhere('grade', 'All Grades')
                  ->orWhereNull('grade');
            });
        }

        $subjects = $query->orderBy('name')->get();

        // Enforce quiz usage count
        $quizCounts = Quiz::selectRaw('subject, count(*) as count')
            ->groupBy('subject')
            ->pluck('count', 'subject');

        $enriched = $subjects->map(function (Subject $subject) use ($quizCounts) {
            $count = $quizCounts->get($subject->name, 0);
            return [
                'id' => $subject->id,
                'name' => $subject->name,
                'code' => $subject->code ?: strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $subject->name), 0, 4)),
                'grade' => $subject->grade ?: 'All Grades',
                'department' => $subject->department,
                'description' => $subject->description,
                'quizzes_count' => $count,
                'created_at' => $subject->created_at,
            ];
        });

        return response()->json([
            'status' => 'success',
            'subjects' => $enriched,
            'data' => $enriched,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'code' => ['nullable', 'string', 'max:30'],
            'grade' => ['nullable', 'string', 'max:30'],
            'department' => ['nullable', 'string', 'max:60'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $name = trim($validated['name']);
        $grade = !empty($validated['grade']) ? trim($validated['grade']) : 'All Grades';

        $exists = Subject::whereRaw('LOWER(name) = ?', [strtolower($name)])
            ->where(function ($q) use ($grade) {
                $q->where('grade', $grade)
                  ->orWhere('grade', 'All Grades');
            })
            ->exists();

        if ($exists) {
            return response()->json([
                'status' => 'error',
                'message' => "Subject '{$name}' is already registered in curriculum.",
            ], 422);
        }

        $code = !empty($validated['code'])
            ? strtoupper(trim($validated['code']))
            : strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $name), 0, 6));

        $subject = Subject::create([
            'name' => $name,
            'code' => $code,
            'grade' => $grade,
            'department' => $validated['department'] ?? null,
            'description' => $validated['description'] ?? null,
        ]);

        return response()->json([
            'status' => 'success',
            'message' => "Subject '{$subject->name}' successfully added to curriculum.",
            'subject' => $subject,
            'data' => $subject,
        ], 201);
    }

    public function destroy(Subject $subject): JsonResponse
    {
        $quizCount = Quiz::where('subject', $subject->name)->count();

        if ($quizCount > 0) {
            return response()->json([
                'status' => 'error',
                'message' => "Cannot remove '{$subject->name}' because {$quizCount} active quiz(zes) are tied to this subject.",
            ], 422);
        }

        $subjectName = $subject->name;
        $subject->delete();

        return response()->json([
            'status' => 'success',
            'message' => "Subject '{$subjectName}' has been removed from the school curriculum.",
        ]);
    }
}
