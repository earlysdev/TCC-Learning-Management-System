<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ActivityLog;
use App\Models\Quiz;
use App\Models\Subject;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SubjectController extends Controller
{
    /**
     * Official Tagoloan Community College (TCC) BSIT Curriculum
     * CMO 25, s. 2015 (1st Year to 4th Year, excluding 4th Year 2nd Sem Practicum Prac 101)
     */
    public static function officialBsitSubjects(): array
    {
        return [
            // FIRST YEAR — FIRST SEMESTER
            ['code' => 'IT 101', 'name' => 'Introduction To Computing', 'grade' => '1st Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'IT 102', 'name' => 'Computer Programming 1', 'grade' => '1st Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'IT 103', 'name' => 'Integrated Application Software', 'grade' => '1st Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'GEC 1', 'name' => 'Understanding the Self', 'grade' => '1st Year', 'semester' => '1st Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'ROTC/CWTS 101', 'name' => 'Basic Army Science/CWTS', 'grade' => '1st Year', 'semester' => '1st Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'PATH FIT 1', 'name' => 'Movement Competency Training', 'grade' => '1st Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 0, 'units' => 2, 'prerequisite' => 'none'],

            // FIRST YEAR — SECOND SEMESTER
            ['code' => 'IT 104', 'name' => 'Information Technology Fundamentals', 'grade' => '1st Year', 'semester' => '2nd Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'IT 101'],
            ['code' => 'IT 105', 'name' => 'Computer Programming 2', 'grade' => '1st Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT 102'],
            ['code' => 'IT 106', 'name' => 'Digital Logic Design', 'grade' => '1st Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'GEC 2', 'name' => 'Readings in Philippine History', 'grade' => '1st Year', 'semester' => '2nd Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'ROTC/CWTS 102', 'name' => 'Reserved Officer Training Corps/CWTS', 'grade' => '1st Year', 'semester' => '2nd Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'R101'],
            ['code' => 'PATH FIT 2', 'name' => 'Fitness Training', 'grade' => '1st Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 0, 'units' => 2, 'prerequisite' => 'PATH FIT 1'],

            // SECOND YEAR — FIRST SEMESTER
            ['code' => 'IT 107', 'name' => 'Application Development & Emerging Technologies', 'grade' => '2nd Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT 105'],
            ['code' => 'IT 108', 'name' => 'Data Structures & Algorithms', 'grade' => '2nd Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT 105'],
            ['code' => 'IT 109', 'name' => 'Fundamentals of Database Systems', 'grade' => '2nd Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT 105'],
            ['code' => 'IT 110', 'name' => 'Object Oriented Programming (OOP)', 'grade' => '2nd Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT 105'],
            ['code' => 'IT 111', 'name' => 'Social Issues & Professional Issues', 'grade' => '2nd Year', 'semester' => '1st Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'IT101/IT104'],
            ['code' => 'GEC 3', 'name' => 'The Contemporary World', 'grade' => '2nd Year', 'semester' => '1st Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'PATH FIT 3', 'name' => 'Dance Sports/In-Dual/Group/Outdoor', 'grade' => '2nd Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 0, 'units' => 2, 'prerequisite' => 'PATH FIT 2'],

            // SECOND YEAR — SECOND SEMESTER
            ['code' => 'IT 112', 'name' => 'Information Management 1', 'grade' => '2nd Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT 108'],
            ['code' => 'IT 113', 'name' => 'Event-Driven Programming', 'grade' => '2nd Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT108/109/110'],
            ['code' => 'IT 114', 'name' => 'Integrative Programming & Technologies 1', 'grade' => '2nd Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT108/109/110'],
            ['code' => 'IT 115', 'name' => 'Human Computer Interaction 1', 'grade' => '2nd Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT108/109/110'],
            ['code' => 'IT 116', 'name' => 'Advanced Database System', 'grade' => '2nd Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT108/109/110'],
            ['code' => 'GEC 4', 'name' => 'Mathematics in the Modern World', 'grade' => '2nd Year', 'semester' => '2nd Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'GEE 6', 'name' => 'Art Appreciation', 'grade' => '2nd Year', 'semester' => '2nd Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'GEE 8', 'name' => 'Ethics', 'grade' => '2nd Year', 'semester' => '2nd Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'PATH FIT 4', 'name' => 'Team Sports', 'grade' => '2nd Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 0, 'units' => 2, 'prerequisite' => 'PATH FIT 3'],

            // SECOND YEAR — SUMMER
            ['code' => 'IT 117', 'name' => 'Quantitative Methods (Modeling & Simulation)', 'grade' => '2nd Year', 'semester' => 'Summer', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT108/109/110/112'],
            ['code' => 'IT 118', 'name' => 'Human Computer Interaction 2', 'grade' => '2nd Year', 'semester' => 'Summer', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT115'],
            ['code' => 'IT Elec 1', 'name' => 'System Analysis and Design (SAD)', 'grade' => '2nd Year', 'semester' => 'Summer', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'IT109/110/116'],

            // THIRD YEAR — FIRST SEMESTER
            ['code' => 'IT 119', 'name' => 'System Integration & Architecture 1', 'grade' => '3rd Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT113/114/115/116'],
            ['code' => 'IT 120', 'name' => 'Research 1 (Methods of Research in Computing)', 'grade' => '3rd Year', 'semester' => '1st Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'IT 112'],
            ['code' => 'IT 121', 'name' => 'Information Management 2', 'grade' => '3rd Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT112'],
            ['code' => 'IT 122', 'name' => 'Integrative Programming & Technologies 2', 'grade' => '3rd Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT114'],
            ['code' => 'IT Elec 2', 'name' => 'Computer Graphics', 'grade' => '3rd Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT 106/118'],
            ['code' => 'GEC 5', 'name' => 'Purposive Communication', 'grade' => '3rd Year', 'semester' => '1st Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'GEC 7', 'name' => 'Science, Technology and Society', 'grade' => '3rd Year', 'semester' => '1st Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'GEC 9', 'name' => 'Life, Works & Writing of Dr. Jose Rizal', 'grade' => '3rd Year', 'semester' => '1st Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'GEE 9', 'name' => 'Technopreneurship (The Entrepreneurial Mind)', 'grade' => '3rd Year', 'semester' => '1st Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],

            // THIRD YEAR — SECOND SEMESTER
            ['code' => 'IT 123', 'name' => 'Information Assurance & Security 1', 'grade' => '3rd Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT119'],
            ['code' => 'IT 124', 'name' => 'Networking 1', 'grade' => '3rd Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT114'],
            ['code' => 'IT 125', 'name' => 'Capstone Project 1', 'grade' => '3rd Year', 'semester' => '2nd Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => '1st/2nd/3rdYr1stSem'],
            ['code' => 'IT 126', 'name' => 'System Integration & Architecture 2', 'grade' => '3rd Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT119'],
            ['code' => 'IT 127', 'name' => 'Platform Technologies', 'grade' => '3rd Year', 'semester' => '2nd Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'IT119'],
            ['code' => 'IT Elec 3', 'name' => 'Computer - Aided Design (CAD)', 'grade' => '3rd Year', 'semester' => '2nd Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT Elective 2'],
            ['code' => 'GEE 4', 'name' => 'Living In the IT Era', 'grade' => '3rd Year', 'semester' => '2nd Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'GEE 7', 'name' => 'Gender & Society', 'grade' => '3rd Year', 'semester' => '2nd Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],
            ['code' => 'GEE 10', 'name' => 'Entrepreneurial Management', 'grade' => '3rd Year', 'semester' => '2nd Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'GEE 9'],
            ['code' => 'GEE 11', 'name' => 'Phil. Indigenous Communities & Peace Studies Education', 'grade' => '3rd Year', 'semester' => '2nd Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'none'],

            // THIRD YEAR — SUMMER
            ['code' => 'IT Elec 4', 'name' => 'Fundamentals of Data Warehousing & Data Mining', 'grade' => '3rd Year', 'semester' => 'Summer', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'IT119'],
            ['code' => 'IT Elec 5', 'name' => 'Multimedia System', 'grade' => '3rd Year', 'semester' => 'Summer', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT Elective 2 & 3'],
            ['code' => 'IT Elec 6', 'name' => 'Management Information System (MIS)', 'grade' => '3rd Year', 'semester' => 'Summer', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'IT Elective 1'],

            // FOURTH YEAR — FIRST SEMESTER (Excludes 4th Year 2nd Sem Practicum Prac 101)
            ['code' => 'IT 128', 'name' => 'System Administration and Maintenance', 'grade' => '4th Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT123/124/126'],
            ['code' => 'IT 129', 'name' => 'Information Assurance & Security 2', 'grade' => '4th Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT123'],
            ['code' => 'IT 130', 'name' => 'Networking 2', 'grade' => '4th Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT124'],
            ['code' => 'IT 131', 'name' => 'Web System and Technologies', 'grade' => '4th Year', 'semester' => '1st Semester', 'lec' => 2, 'lab' => 1, 'units' => 3, 'prerequisite' => 'IT 127'],
            ['code' => 'IT 132', 'name' => 'Capstone Project 2', 'grade' => '4th Year', 'semester' => '1st Semester', 'lec' => 3, 'lab' => 0, 'units' => 3, 'prerequisite' => 'IT125'],
        ];
    }

    private function ensureOfficialCurriculumSynced(): void
    {
        // Always exclude 4th Year Practicum (Prac 101) and legacy non-prospectus duplicates
        Subject::where('code', 'LIKE', 'Prac%')
            ->orWhere('name', 'LIKE', '%Practicum%')
            ->orWhereIn('code', ['NSTP 1', 'Math 1', 'Math 2', 'Math 3'])
            ->delete();

        // If 4th Year subjects are not yet present in DB, sync the full 58-course curriculum
        $hasFourthYear = Subject::where('grade', '4th Year')->exists();
        if ($hasFourthYear && Subject::count() === 58) {
            return;
        }

        foreach (self::officialBsitSubjects() as $subj) {
            $desc = "{$subj['semester']} • {$subj['units']} Units ({$subj['lec']} Lec / {$subj['lab']} Lab) • Preq: {$subj['prerequisite']}";
            Subject::updateOrCreate(
                ['code' => $subj['code']],
                [
                    'name' => $subj['name'],
                    'code' => $subj['code'],
                    'grade' => $subj['grade'],
                    'department' => 'BSIT',
                    'description' => $desc,
                ]
            );
        }
    }

    public function index(Request $request): JsonResponse
    {
        $this->ensureOfficialCurriculumSynced();

        $query = Subject::query();

        $user = $request->user();
        if ($request->has('department') && !empty($request->department) && $request->department !== 'all') {
            $query->where('department', $request->department);
        } elseif ($user && ! $user->isInstitutionWide()) {
            $query->where('department', $user->departmentCode());
        }

        if ($request->filled('grade') && $request->grade !== 'all' && $request->grade !== 'All Grades') {
            $query->where(function ($q) use ($request) {
                $q->where('grade', $request->grade)
                  ->orWhere('grade', 'All Grades')
                  ->orWhereNull('grade');
            });
        }

        $subjects = $query->orderBy('id')->get();

        // Enforce quiz usage count
        $quizCounts = Quiz::selectRaw('subject, count(*) as count')
            ->groupBy('subject')
            ->pluck('count', 'subject');

        $enriched = $subjects->map(function (Subject $subject) use ($quizCounts) {
            $fullLabel = $subject->code ? "{$subject->code} - {$subject->name}" : $subject->name;
            $count = (int) ($quizCounts->get($subject->name, 0) + $quizCounts->get($fullLabel, 0));
            return [
                'id' => $subject->id,
                'name' => $subject->name,
                'code' => $subject->code ?: strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $subject->name), 0, 4)),
                'grade' => $subject->grade ?: '1st Year',
                'department' => $subject->department ?: 'BSIT',
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
            'name' => ['required', 'string', 'max:120'],
            'code' => ['nullable', 'string', 'max:30'],
            'grade' => ['nullable', 'string', 'max:40'],
            'department' => ['nullable', 'string', 'max:60'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);

        $name = trim($validated['name']);
        $code = !empty($validated['code'])
            ? trim($validated['code'])
            : strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $name), 0, 6));

        if (stripos($code, 'Prac') === 0 || stripos($name, 'Practicum') !== false) {
            return response()->json([
                'status' => 'error',
                'message' => '4th Year Practicum (Prac 101) is excluded from online quiz curriculum subjects.',
            ], 422);
        }

        $grade = !empty($validated['grade']) ? trim($validated['grade']) : '1st Year';

        $exists = Subject::whereRaw('LOWER(code) = ?', [strtolower($code)])
            ->orWhere(function ($q) use ($name, $grade) {
                $q->whereRaw('LOWER(name) = ?', [strtolower($name)])
                  ->where('grade', $grade);
            })
            ->exists();

        if ($exists) {
            return response()->json([
                'status' => 'error',
                'message' => "Subject '{$code} - {$name}' is already registered in the curriculum.",
            ], 422);
        }

        $subject = Subject::create([
            'name' => $name,
            'code' => $code,
            'grade' => $grade,
            'department' => $validated['department'] ?? 'BSIT',
            'description' => $validated['description'] ?? "{$grade} Curriculum Subject",
        ]);

        ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'create_subject',
            'description' => "Added curriculum subject '{$subject->code} - {$subject->name}' ({$subject->grade})",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => "Subject '{$subject->code} - {$subject->name}' successfully added to {$subject->grade} curriculum.",
            'subject' => $subject,
            'data' => $subject,
        ], 201);
    }

    public function destroy(Request $request, Subject $subject): JsonResponse
    {
        $fullLabel = $subject->code ? "{$subject->code} - {$subject->name}" : $subject->name;
        $quizCount = Quiz::where('subject', $subject->name)
            ->orWhere('subject', $fullLabel)
            ->count();

        if ($quizCount > 0) {
            return response()->json([
                'status' => 'error',
                'message' => "Cannot remove '{$subject->name}' because {$quizCount} active quiz(zes) are tied to this subject.",
            ], 422);
        }

        $subjectName = "{$subject->code} - {$subject->name}";
        $subject->delete();

        ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'delete_subject',
            'description' => "Removed curriculum subject '{$subjectName}'",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => "Subject '{$subjectName}' has been removed from the school curriculum.",
        ]);
    }
}
