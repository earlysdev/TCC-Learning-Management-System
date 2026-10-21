<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Quiz;
use App\Models\Section;
use App\Models\Subject;
use Illuminate\Database\Seeder;

class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $password = 'LnhsDemo!2026';
        $accounts = [
            ['name' => 'Demo Student', 'first_name' => 'Demo', 'last_name' => 'Student', 'email' => 'student.demo@lnhs.test', 'lrn' => '123456789012', 'role' => 'student', 'grade' => 'Grade 7', 'section' => 'Rizal', 'school_year' => '2025-2026'],
            ['name' => 'Maria Santos', 'first_name' => 'Maria', 'last_name' => 'Santos', 'email' => 'maria.santos@lnhs.test', 'lrn' => '123456789013', 'role' => 'student', 'grade' => 'Grade 10', 'section' => 'Emerald', 'school_year' => '2025-2026'],
            ['name' => 'Demo Teacher', 'first_name' => 'Demo', 'last_name' => 'Teacher', 'email' => 'teacher.demo@lnhs.test', 'lrn' => null, 'role' => 'teacher', 'school_year' => null],
            ['name' => 'Demo Secretary', 'first_name' => 'Demo', 'last_name' => 'Secretary', 'email' => 'secretary.demo@lnhs.test', 'lrn' => null, 'role' => 'secretary', 'school_year' => null],
            ['name' => 'College Dean', 'first_name' => 'College', 'last_name' => 'Dean', 'email' => 'dean.demo@tcc.test', 'lrn' => null, 'role' => 'dean', 'school_year' => null],
            ['name' => 'College Dean', 'first_name' => 'College', 'last_name' => 'Dean', 'email' => 'principal.demo@lnhs.test', 'lrn' => null, 'role' => 'dean', 'school_year' => null],
        ];

        foreach ($accounts as $account) {
            User::updateOrCreate(
                ['email' => $account['email']],
                [...$account, 'password' => $password, 'email_verified_at' => now(), 'status' => 'active'],
            );
        }

        $sections = [
            ['grade' => 'Grade 7', 'name' => 'Rizal', 'display_name' => 'Grade 7 - Rizal'],
            ['grade' => 'Grade 7', 'name' => 'Bonifacio', 'display_name' => 'Grade 7 - Bonifacio'],
            ['grade' => 'Grade 8', 'name' => 'Emerald', 'display_name' => 'Grade 8 - Emerald'],
            ['grade' => 'Grade 8', 'name' => 'Diamond', 'display_name' => 'Grade 8 - Diamond'],
            ['grade' => 'Grade 9', 'name' => 'Ruby', 'display_name' => 'Grade 9 - Ruby'],
            ['grade' => 'Grade 9', 'name' => 'Sapphire', 'display_name' => 'Grade 9 - Sapphire'],
            ['grade' => 'Grade 10', 'name' => 'Emerald', 'display_name' => 'Grade 10 - Emerald'],
            ['grade' => 'Grade 10', 'name' => 'Diamond', 'display_name' => 'Grade 10 - Diamond'],
            ['grade' => 'Grade 11', 'name' => 'STEM-A', 'display_name' => 'Grade 11 - STEM-A'],
            ['grade' => 'Grade 12', 'name' => 'STEM-A', 'display_name' => 'Grade 12 - STEM-A'],
        ];

        foreach ($sections as $s) {
            Section::updateOrCreate(['display_name' => $s['display_name']], $s);
        }

        $subjects = [
            ['name' => 'Science', 'code' => 'SCI', 'grade' => 'All Grades', 'department' => 'Science Department', 'description' => 'Natural sciences, biology, chemistry, and physics'],
            ['name' => 'Mathematics', 'code' => 'MATH', 'grade' => 'All Grades', 'department' => 'Mathematics Department', 'description' => 'Algebra, geometry, statistics, and general mathematics'],
            ['name' => 'English', 'code' => 'ENG', 'grade' => 'All Grades', 'department' => 'Languages Department', 'description' => 'English language, communication arts, and literature'],
            ['name' => 'Filipino', 'code' => 'FIL', 'grade' => 'All Grades', 'department' => 'Languages Department', 'description' => 'Wikang Filipino, panitikan, at komunikasyon'],
            ['name' => 'Araling Panlipunan', 'code' => 'AP', 'grade' => 'All Grades', 'department' => 'Social Studies Department', 'description' => 'Kasaysayan, ekonomiks, at kontemporaryong isyu'],
            ['name' => 'MAPEH', 'code' => 'MAPEH', 'grade' => 'All Grades', 'department' => 'MAPEH Department', 'description' => 'Music, Arts, Physical Education, and Health'],
            ['name' => 'TLE / TVL', 'code' => 'TLE', 'grade' => 'All Grades', 'department' => 'Vocational Department', 'description' => 'Technology and Livelihood Education / Technical-Vocational-Livelihood'],
            ['name' => 'Edukasyon sa Pagpapakatao', 'code' => 'ESP', 'grade' => 'All Grades', 'department' => 'Values Department', 'description' => 'Values education and moral character formation'],
        ];

        foreach ($subjects as $subj) {
            Subject::updateOrCreate(['name' => $subj['name']], $subj);
        }

        $teacher = User::where('email', 'teacher.demo@lnhs.test')->firstOrFail();
        Quiz::updateOrCreate(
            ['teacher_id' => $teacher->id, 'title' => 'Ecosystems: demo quiz'],
            [
                'subject' => 'Science',
                'topic' => 'Ecosystems',
                'instructions' => 'Choose the best answer for each question. You can submit this quiz once.',
                'is_published' => true,
                'allow_review' => true,
                'generated_by_ai' => false,
                'target_type' => 'all',
                'questions' => [
                    ['prompt' => 'What is an ecosystem?', 'options' => ['A community of organisms interacting with each other and their environment', 'A single animal living alone', 'Only the nonliving parts of a place', 'A group of organisms of one species'], 'correct_index' => 0, 'skill' => 'Ecosystem structure'],
                    ['prompt' => 'Which is a producer in most ecosystems?', 'options' => ['Mushroom', 'Green plant', 'Hawk', 'Earthworm'], 'correct_index' => 1, 'skill' => 'Food chains'],
                    ['prompt' => 'What role do decomposers play?', 'options' => ['They make sunlight', 'They hunt every consumer', 'They break down dead matter and recycle nutrients', 'They stop energy transfer'], 'correct_index' => 2, 'skill' => 'Decomposition'],
                    ['prompt' => 'What is the main source of energy for most ecosystems?', 'options' => ['The Sun', 'Soil minerals', 'Wind', 'The Moon'], 'correct_index' => 0, 'skill' => 'Energy flow'],
                    ['prompt' => 'If a predator population drops, what may happen first to its prey?', 'options' => ['The prey population may increase', 'All plants disappear immediately', 'The prey becomes a producer', 'The ecosystem loses sunlight'], 'correct_index' => 0, 'skill' => 'Population relationships'],
                ],
            ],
        );

        $principal = User::where('email', 'principal.demo@lnhs.test')->firstOrFail();

        \App\Models\Announcement::firstOrCreate(
            ['title' => 'Welcome to LNHS LMS'],
            [
                'user_id' => $principal->id,
                'content' => 'Welcome back students and teachers! Have a great school year.',
                'target_role' => null,
                'is_pinned' => true
            ]
        );

        \App\Models\LmsNotification::firstOrCreate(
            ['title' => 'System Update'],
            [
                'recipient_role' => null,
                'type' => 'system',
                'message' => 'The LMS has been updated to version 2.0 with Anti-Cheat Proctoring.',
                'data' => null
            ]
        );

        \App\Models\SystemSetting::set('school_year', '2025-2026', 'string', 'Current school year');
        \App\Models\SystemSetting::set('maintenance_mode', false, 'boolean', 'Is system under maintenance');
    }
}
