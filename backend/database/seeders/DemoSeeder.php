<?php

namespace Database\Seeders;

use App\Http\Controllers\Api\SubjectController;
use App\Models\ActivityLog;
use App\Models\Announcement;
use App\Models\LmsNotification;
use App\Models\Quiz;
use App\Models\QuizAttempt;
use App\Models\Section;
use App\Models\SecurityLog;
use App\Models\Subject;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Database\Seeder;

class DemoSeeder extends Seeder
{
    public function run(): void
    {
        // Clear any existing test/demo records
        QuizAttempt::query()->delete();
        Quiz::query()->delete();
        Announcement::query()->delete();
        LmsNotification::query()->delete();
        ActivityLog::query()->delete();
        SecurityLog::query()->delete();
        Section::query()->delete();
        Subject::query()->delete();

        // Remove legacy test accounts
        User::whereIn('email', [
            'student.demo@lnhs.test',
            'maria.santos@lnhs.test',
            'teacher.demo@lnhs.test',
            'secretary.demo@lnhs.test',
            'principal.demo@lnhs.test',
            'dean.demo@tcc.test',
        ])->delete();

        $password = 'TccPortal!2026';
        $accounts = [
            [
                'name' => 'Atan Villanueva',
                'first_name' => 'Atan',
                'last_name' => 'Villanueva',
                'email' => 'student@tcc.edu.ph',
                'lrn' => '20273710',
                'role' => 'student',
                'grade' => '1st Year',
                'section' => 'Block - 1A',
                'department' => 'CIT',
                'school_year' => '2026-2027',
            ],
            [
                'name' => 'Kay Waga',
                'first_name' => 'Kay',
                'last_name' => 'Waga',
                'email' => 'teacher@tcc.edu.ph',
                'lrn' => null,
                'role' => 'teacher',
                'department' => 'CIT',
                'grade' => null,
                'section' => null,
                'school_year' => '2026-2027',
            ],
            [
                'name' => 'Nikko Perez',
                'first_name' => 'Nikko',
                'last_name' => 'Perez',
                'email' => 'secretary@tcc.edu.ph',
                'lrn' => null,
                'role' => 'secretary',
                'department' => 'CIT',
                'grade' => null,
                'section' => null,
                'school_year' => '2026-2027',
            ],
            [
                'name' => 'Gabriel Casiño',
                'first_name' => 'Gabriel',
                'last_name' => 'Casiño',
                'email' => 'dean@tcc.edu.ph',
                'lrn' => null,
                'role' => 'dean',
                'department' => 'CIT',
                'grade' => null,
                'section' => null,
                'school_year' => '2026-2027',
            ],
        ];

        foreach ($accounts as $account) {
            User::updateOrCreate(
                ['email' => $account['email']],
                [...$account, 'password' => $password, 'email_verified_at' => now(), 'status' => 'active'],
            );
        }

        // Seed College Blocks (1st Year: Block - 1A..1E, 2nd Year: 2A..2E, 3rd Year: 3A..3E, 4th Year: 4A..4E)
        $yearBlocks = [
            '1st Year' => ['Block - 1A', 'Block - 1B', 'Block - 1C', 'Block - 1D', 'Block - 1E'],
            '2nd Year' => ['Block - 2A', 'Block - 2B', 'Block - 2C', 'Block - 2D', 'Block - 2E'],
            '3rd Year' => ['Block - 3A', 'Block - 3B', 'Block - 3C', 'Block - 3D', 'Block - 3E'],
            '4th Year' => ['Block - 4A', 'Block - 4B', 'Block - 4C', 'Block - 4D', 'Block - 4E'],
        ];

        foreach ($yearBlocks as $yearLevel => $blocks) {
            foreach ($blocks as $blockName) {
                Section::updateOrCreate(
                    ['display_name' => $blockName],
                    [
                        'grade' => $yearLevel,
                        'name' => $blockName,
                        'display_name' => $blockName,
                        'department' => 'CIT',
                    ]
                );
            }
        }

        // Seed Official BSIT Subject Codes & Descriptions (1st Year to 4th Year, excluding 4th Year Practicum)
        $subjects = SubjectController::officialBsitSubjects();

        foreach ($subjects as $subj) {
            $desc = "{$subj['semester']} • {$subj['units']} Units ({$subj['lec']} Lec / {$subj['lab']} Lab) • Preq: {$subj['prerequisite']}";
            Subject::updateOrCreate(
                ['code' => $subj['code']],
                [
                    'name' => $subj['name'],
                    'code' => $subj['code'],
                    'grade' => $subj['grade'],
                    'department' => 'CIT',
                    'description' => $desc,
                ]
            );
        }

        SystemSetting::where('key', 'maintenance_mode')->delete();
        SystemSetting::set('school_year', '2026-2027', 'string', 'Current school year');

        $deanUser = User::where('email', 'dean@tcc.edu.ph')->first();
        $studentUser = User::where('email', 'student@tcc.edu.ph')->first();

        if ($deanUser) {
            $welcomeAnnouncement = Announcement::create([
                'user_id' => $deanUser->id,
                'title' => 'Welcome to Tagoloan Community College (TCC) Online Assessment Portal',
                'content' => 'All BSIT 1st Year to 4th Year students are reminded to observe strict academic integrity during online assessments. Full-screen proctoring and AI study diagnostics are active for SY 2026-2027.',
                'target_role' => null,
                'is_pinned' => true,
            ]);

            LmsNotification::create([
                'user_id' => $studentUser?->id,
                'recipient_role' => 'student',
                'type' => 'announcement',
                'title' => 'TCC Academic Portal Notice',
                'message' => $welcomeAnnouncement->title,
                'data' => ['announcement_id' => $welcomeAnnouncement->id],
                'is_read' => false,
            ]);

            ActivityLog::create([
                'user_id' => $deanUser->id,
                'action' => 'system_initialized',
                'description' => 'Initialized TCC BSIT Curriculum (58 Courses, 1st-4th Year excluding Practicum, 20 College Blocks) for SY 2026-2027',
                'ip_address' => '127.0.0.1',
                'user_agent' => 'TCC-System-Seeder',
            ]);
        }
    }
}
