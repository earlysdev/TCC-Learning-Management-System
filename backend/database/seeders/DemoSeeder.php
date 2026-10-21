<?php

namespace Database\Seeders;

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
                'name' => 'TCC Student',
                'first_name' => 'TCC',
                'last_name' => 'Student',
                'email' => 'student@tcc.edu.ph',
                'lrn' => '20273710',
                'role' => 'student',
                'grade' => '1st Year',
                'section' => 'Block - 1A',
                'school_year' => '2025-2026',
            ],
            [
                'name' => 'TCC Faculty',
                'first_name' => 'TCC',
                'last_name' => 'Faculty',
                'email' => 'teacher@tcc.edu.ph',
                'lrn' => null,
                'role' => 'teacher',
                'grade' => null,
                'section' => null,
                'school_year' => null,
            ],
            [
                'name' => 'TCC Secretary',
                'first_name' => 'TCC',
                'last_name' => 'Secretary',
                'email' => 'secretary@tcc.edu.ph',
                'lrn' => null,
                'role' => 'secretary',
                'grade' => null,
                'section' => null,
                'school_year' => null,
            ],
            [
                'name' => 'College Dean',
                'first_name' => 'College',
                'last_name' => 'Dean',
                'email' => 'dean@tcc.edu.ph',
                'lrn' => null,
                'role' => 'dean',
                'grade' => null,
                'section' => null,
                'school_year' => null,
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
                    ]
                );
            }
        }

        // Seed Official BSIT Subject Codes & Descriptions
        $subjects = [
            // 2024-2025 1st — BSIT Year 1st
            ['code' => 'PATH FIT 1', 'name' => 'Movement Competency Training', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'GEC 1', 'name' => 'Understanding the Self', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'IT 101', 'name' => 'Introduction To Computing', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'IT 102', 'name' => 'Computer Programming 1', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'IT 103', 'name' => 'Integrated Application Software', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'Math 1', 'name' => 'College Algebra', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'Math 2', 'name' => 'Plane Trigonometry', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'NSTP 1', 'name' => 'CWTS/ROTC 1', 'grade' => '1st Year', 'department' => 'BSIT'],

            // 2024-2025 2nd — BSIT Year 1st
            ['code' => 'ROTC/CWTS 102', 'name' => 'Reserved Officer Training Corps/CWTS', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'IT 105', 'name' => 'Computer Programming 2', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'IT 106', 'name' => 'Digital Logic Design', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'PATH FIT 2', 'name' => 'Fitness Training', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'IT 104', 'name' => 'Information Technology Fundamentals', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'Math 3', 'name' => 'Pre-Calculus', 'grade' => '1st Year', 'department' => 'BSIT'],
            ['code' => 'GEC 2', 'name' => 'READING IN PHILIPPINE HISTORY', 'grade' => '1st Year', 'department' => 'BSIT'],

            // 2025-2026 1st — BSIT Year 2nd
            ['code' => 'PATH FIT 3', 'name' => 'DANCE SPORTS & INDIVIDUAL/GROUP EXERCISE/OUTDOOR', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'GEC 3', 'name' => 'The Contemporary World', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'IT 107', 'name' => 'Application Development & Emerging Technologies', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'IT 108', 'name' => 'Data Structures & Algorithms', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'IT 109', 'name' => 'Fundamentals of Database Systems', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'IT 110', 'name' => 'Object Oriented Programming (OOP)', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'IT 111', 'name' => 'Social Issues & Professional Issues', 'grade' => '2nd Year', 'department' => 'BSIT'],

            // 2025-2026 2nd — BSIT Year 2nd
            ['code' => 'IT 112', 'name' => 'Information Management 1', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'IT 113', 'name' => 'Event-Driven Programming', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'IT 114', 'name' => 'Integrative Programming & Technologies 1', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'IT 115', 'name' => 'Human Computer Interaction 1', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'IT 116', 'name' => 'Advanced Database System', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'PATH FIT 4', 'name' => 'Team Sports', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'GEC 4', 'name' => 'Mathematics in the Modern World', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'GEE 6', 'name' => 'Art Appreciation', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'GEE 8', 'name' => 'Ethics', 'grade' => '2nd Year', 'department' => 'BSIT'],

            // 2025-2026 Summer — BSIT Year 2nd
            ['code' => 'IT 117', 'name' => 'QualitativeMethods(Modeling&Simulation)', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'IT 118', 'name' => 'Human Computer Interaction 2', 'grade' => '2nd Year', 'department' => 'BSIT'],
            ['code' => 'IT Elec 1', 'name' => 'System Analysis and Design (SAD)', 'grade' => '2nd Year', 'department' => 'BSIT'],

            // 2026-2027 1st — BSIT Year 3rd
            ['code' => 'IT 119', 'name' => 'System Integration & Architecture 1', 'grade' => '3rd Year', 'department' => 'BSIT'],
            ['code' => 'IT 120', 'name' => 'Research1 (Methods of Research in Computing)', 'grade' => '3rd Year', 'department' => 'BSIT'],
            ['code' => 'IT 121', 'name' => 'Information Management 2', 'grade' => '3rd Year', 'department' => 'BSIT'],
            ['code' => 'IT 122', 'name' => 'Integrative Programming & Technologies 2', 'grade' => '3rd Year', 'department' => 'BSIT'],
            ['code' => 'IT Elec 2', 'name' => 'Computer Graphics', 'grade' => '3rd Year', 'department' => 'BSIT'],
            ['code' => 'GEC 5', 'name' => 'Purposive Communication', 'grade' => '3rd Year', 'department' => 'BSIT'],
            ['code' => 'GEC 7', 'name' => 'Science, Technology, and Society', 'grade' => '3rd Year', 'department' => 'BSIT'],
            ['code' => 'GEC 9', 'name' => 'Life, Works & Writing of Dr. Jose Rizal', 'grade' => '3rd Year', 'department' => 'BSIT'],
            ['code' => 'GEE 9', 'name' => 'Technoprenuership (The Entrepreneurial Mind)', 'grade' => '3rd Year', 'department' => 'BSIT'],
        ];

        foreach ($subjects as $subj) {
            Subject::updateOrCreate(
                ['code' => $subj['code']],
                [
                    'name' => $subj['name'],
                    'code' => $subj['code'],
                    'grade' => $subj['grade'],
                    'department' => $subj['department'],
                    'description' => $subj['name'],
                ]
            );
        }

        SystemSetting::set('school_year', '2025-2026', 'string', 'Current school year');
        SystemSetting::set('maintenance_mode', false, 'boolean', 'Is system under maintenance');
    }
}
