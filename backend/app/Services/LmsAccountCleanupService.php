<?php

namespace App\Services;

use App\Http\Controllers\Api\SubjectController;
use App\Mail\LmsAccountCreatedMail;
use App\Models\ActivityLog;
use App\Models\Announcement;
use App\Models\LmsNotification;
use App\Models\Quiz;
use App\Models\QuizAttempt;
use App\Models\Section;
use App\Models\SecurityLog;
use App\Models\Subject;
use App\Models\SystemSetting;
use App\Models\TrustedDevice;
use App\Models\User;
use App\Models\VerificationCode;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class LmsAccountCleanupService
{
    public const PROVISION_SETTING_KEY = 'real_gmail_accounts_provisioned_v3';

    /**
     * Primary institutional @gmail.com accounts explicitly assigned by role and department.
     *
     * @var array<int, array<string, mixed>>
     */
    public const PRIMARY_GMAIL_ACCOUNTS = [
        [
            'email' => 'sanolanchristianearl@gmail.com',
            'name' => 'Christian Earl Sanolan',
            'first_name' => 'Christian Earl',
            'last_name' => 'Sanolan',
            'role' => 'dean',
            'department' => 'CIT',
            'grade' => null,
            'section' => null,
            'lrn' => null,
            'school_year' => '2026-2027',
        ],
        [
            'email' => 'tcclms4@gmail.com',
            'name' => 'Louise Gutenberg',
            'first_name' => 'Louise',
            'last_name' => 'Gutenberg',
            'role' => 'dean',
            'department' => 'CED',
            'grade' => null,
            'section' => null,
            'lrn' => null,
            'school_year' => '2026-2027',
        ],
        [
            'email' => 'vinsmokeearl@gmail.com',
            'name' => 'Charlie Viador',
            'first_name' => 'Charlie',
            'last_name' => 'Viador',
            'role' => 'secretary',
            'department' => 'CIT',
            'grade' => null,
            'section' => null,
            'lrn' => null,
            'school_year' => '2026-2027',
        ],
    ];

    /**
     * Other @gmail.com user accounts created on the portal, preserved/assigned by their role.
     *
     * @var array<int, array<string, mixed>>
     */
    public const EXISTING_ROLE_GMAIL_ACCOUNTS = [
        [
            'email' => 'blinkeyetest@gmail.com',
            'name' => 'Miya Raheel',
            'first_name' => 'Miya',
            'last_name' => 'Raheel',
            'role' => 'teacher',
            'department' => 'CIT',
            'grade' => '4th Year',
            'section' => null,
            'lrn' => null,
            'school_year' => '2026-2027',
        ],
        [
            'email' => 'totoby2x1@gmail.com',
            'name' => 'Juan Luna',
            'first_name' => 'Juan',
            'last_name' => 'Luna',
            'role' => 'teacher',
            'department' => 'CIT',
            'grade' => '4th Year',
            'section' => null,
            'lrn' => null,
            'school_year' => '2026-2027',
        ],
        [
            'email' => 'beams4fun@gmail.com',
            'name' => 'Yuri Pacana',
            'first_name' => 'Yuri',
            'last_name' => 'Pacana',
            'role' => 'teacher',
            'department' => 'CIT',
            'grade' => '3rd Year',
            'section' => null,
            'lrn' => null,
            'school_year' => '2026-2027',
        ],
        [
            'email' => 'ronaldtrump@gmail.com',
            'name' => 'Ronald Trump',
            'first_name' => 'Ronald',
            'last_name' => 'Trump',
            'role' => 'student',
            'department' => 'CIT',
            'grade' => '1st Year',
            'section' => 'Block - 1A',
            'lrn' => '20270001',
            'school_year' => '2026-2027',
        ],
        [
            'email' => 'justinbatumbakal@gmail.com',
            'name' => 'Justin Batumbakal',
            'first_name' => 'Justin',
            'last_name' => 'Batumbakal',
            'role' => 'student',
            'department' => 'CIT',
            'grade' => '1st Year',
            'section' => 'Block - 1B',
            'lrn' => '20270002',
            'school_year' => '2026-2027',
        ],
    ];

    /**
     * Deterministic institutional initial password per email so local and cloud databases
     * stay 100% synchronized with the credentials dispatched via email.
     */
    public static function passwordForEmail(string $email): string
    {
        $normalized = strtolower(trim($email));

        return match ($normalized) {
            'sanolanchristianearl@gmail.com' => 'TccDean!2026#CIT',
            'tcclms4@gmail.com' => 'TccDean!2026#CED',
            'vinsmokeearl@gmail.com' => 'TccSec!2026#CIT',
            'blinkeyetest@gmail.com' => '9neT+5c*mP*N',
            'totoby2x1@gmail.com' => 'V6@EPZ%3xn8d',
            'beams4fun@gmail.com' => 'TccFaculty!2026#03',
            'ronaldtrump@gmail.com' => 'TccStu!20270001',
            'justinbatumbakal@gmail.com' => 'TccStu!20270002',
            default => 'Tcc!' . strtoupper(substr(hash('sha256', 'tcc-lms-2026:' . $normalized), 0, 6)) . '#26',
        };
    }

    /**
     * Ensure any post-Nov-8 schema columns (department isolation, dean_department uniqueness)
     * exist on hosts where git deployments do not automatically execute php artisan migrate.
     */
    public static function ensureSchemaColumnsExist(): void
    {
        foreach (['users', 'quizzes', 'sections', 'announcements', 'notifications'] as $tableName) {
            if (Schema::hasTable($tableName) && ! Schema::hasColumn($tableName, 'department')) {
                try {
                    Schema::table($tableName, function (Blueprint $table): void {
                        $table->string('department', 16)->default('CIT')->index();
                    });
                } catch (\Throwable $e) {
                    Log::warning("Schema repair for {$tableName}.department skipped: " . $e->getMessage());
                }
            }
        }

        if (Schema::hasTable('security_logs') && ! Schema::hasColumn('security_logs', 'department')) {
            try {
                Schema::table('security_logs', function (Blueprint $table): void {
                    $table->string('department', 16)->nullable()->index();
                });
            } catch (\Throwable $e) {
                Log::warning('Schema repair for security_logs.department skipped: ' . $e->getMessage());
            }
        }

        if (Schema::hasTable('security_logs') && ! Schema::hasColumn('security_logs', 'resolved_by')) {
            try {
                Schema::table('security_logs', function (Blueprint $table): void {
                    $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
                });
            } catch (\Throwable $e) {
                Log::warning('Schema repair for security_logs.resolved_by skipped: ' . $e->getMessage());
            }
        }

        if (Schema::hasTable('system_settings') && ! Schema::hasColumn('system_settings', 'department')) {
            try {
                Schema::table('system_settings', function (Blueprint $table): void {
                    $table->string('department', 16)->nullable()->index();
                });
            } catch (\Throwable $e) {
                Log::warning('Schema repair for system_settings.department skipped: ' . $e->getMessage());
            }

            try {
                Schema::table('system_settings', function (Blueprint $table): void {
                    $table->dropUnique(['key']);
                });
            } catch (\Throwable) {
                // Index may already be dropped or named differently
            }

            try {
                Schema::table('system_settings', function (Blueprint $table): void {
                    $table->unique(['department', 'key']);
                });
            } catch (\Throwable) {
                // Unique index may already exist
            }
        }

        if (Schema::hasTable('users') && ! Schema::hasColumn('users', 'dean_department')) {
            try {
                Schema::table('users', function (Blueprint $table): void {
                    $table->string('dean_department', 16)->nullable()->unique();
                });
            } catch (\Throwable $e) {
                Log::warning('Schema repair for users.dean_department skipped: ' . $e->getMessage());
            }
        }
    }

    /**
     * Ensure the one-time cleanup of demo accounts/quizzes and provisioning of real @gmail.com
     * accounts has been executed on the active database.
     */
    public static function ensureProvisioned(): void
    {
        if (app()->runningUnitTests()) {
            return;
        }

        try {
            if (! Schema::hasTable('users') || ! Schema::hasTable('system_settings')) {
                return;
            }

            $alreadyDone = SystemSetting::get(self::PROVISION_SETTING_KEY);
            if ($alreadyDone && Schema::hasColumn('users', 'dean_department') && Schema::hasColumn('security_logs', 'department')) {
                return;
            }

            self::ensureSchemaColumnsExist();

            if ($alreadyDone) {
                return;
            }

            self::executeCleanupAndProvision(
                dispatchEmails: true,
                skipAlreadyDispatchedKnownEmails: true
            );
        } catch (\Throwable $e) {
            Log::warning('LmsAccountCleanupService::ensureProvisioned warning: ' . $e->getMessage());
        }
    }

    /**
     * Run the full cleanup, account assignment, and optional credential email dispatch.
     *
     * @return array{deleted_quizzes: int, deleted_demo_users: int, provisioned_users: array<int, array<string, mixed>>, email_results: array<int, array<string, mixed>>}
     */
    public static function executeCleanupAndProvision(
        bool $dispatchEmails = false,
        bool $skipAlreadyDispatchedKnownEmails = false
    ): array {
        self::ensureSchemaColumnsExist();

        $txResult = DB::transaction(function (): array {
            $deletedQuizzes = 0;
            $deletedDemoUsers = 0;

            // 1. Delete all pre-existing and demo quizzes, attempts, and live sessions
            if (Schema::hasTable('quiz_live_sessions')) {
                DB::table('quiz_live_sessions')->delete();
            }
            if (Schema::hasTable('quiz_attempts')) {
                QuizAttempt::query()->delete();
            }
            if (Schema::hasTable('quiz_assignments')) {
                DB::table('quiz_assignments')->delete();
            }
            if (Schema::hasTable('quizzes')) {
                $deletedQuizzes = Quiz::query()->count();
                Quiz::query()->delete();
            }
            if (Schema::hasTable('notifications')) {
                LmsNotification::whereIn('type', ['quiz_published', 'quiz_completed'])->delete();
            }

            // 2. Delete all demo and non-@gmail.com accounts
            $demoUsers = User::query()
                ->whereRaw('LOWER(email) NOT LIKE ?', ['%@gmail.com'])
                ->pluck('id')
                ->all();

            if (! empty($demoUsers)) {
                $deletedDemoUsers = count($demoUsers);

                if (Schema::hasTable('personal_access_tokens')) {
                    DB::table('personal_access_tokens')
                        ->whereIn('tokenable_id', $demoUsers)
                        ->delete();
                }
                if (Schema::hasTable('sessions')) {
                    DB::table('sessions')
                        ->whereIn('user_id', $demoUsers)
                        ->delete();
                }
                if (Schema::hasTable('trusted_devices')) {
                    TrustedDevice::whereIn('user_id', $demoUsers)->delete();
                }
                if (Schema::hasTable('verification_codes')) {
                    VerificationCode::whereIn('user_id', $demoUsers)->delete();
                }
                if (Schema::hasTable('announcements')) {
                    Announcement::whereIn('user_id', $demoUsers)->delete();
                }
                if (Schema::hasTable('notifications')) {
                    LmsNotification::whereIn('user_id', $demoUsers)->delete();
                }
                if (Schema::hasTable('activity_logs')) {
                    ActivityLog::whereIn('user_id', $demoUsers)->delete();
                }
                if (Schema::hasTable('security_logs')) {
                    SecurityLog::whereIn('user_id', $demoUsers)->delete();
                    if (Schema::hasColumn('security_logs', 'resolved_by')) {
                        SecurityLog::whereIn('resolved_by', $demoUsers)->update(['resolved_by' => null]);
                    }
                }

                User::whereIn('id', $demoUsers)->delete();
            }

            // 3. Clear dean_department across all users first so unique constraint (users_dean_department_unique)
            //    never collides when reassigning CIT and CED Deans in Step 4 and Step 6.
            if (Schema::hasColumn('users', 'dean_department')) {
                DB::table('users')
                    ->whereNotNull('dean_department')
                    ->update(['dean_department' => null]);
            }

            // 4. Upsert the 3 specified primary @gmail.com accounts
            $primaryEmailsLower = [];
            $primaryUserModels = [];

            foreach (self::PRIMARY_GMAIL_ACCOUNTS as $spec) {
                $emailLower = strtolower($spec['email']);
                $primaryEmailsLower[] = $emailLower;
                $plainPassword = self::passwordForEmail($emailLower);

                $user = User::query()
                    ->whereRaw('LOWER(email) = ?', [$emailLower])
                    ->first() ?? new User();

                $user->fill([
                    'email' => $emailLower,
                    'name' => $spec['name'],
                    'first_name' => $spec['first_name'],
                    'last_name' => $spec['last_name'],
                    'role' => $spec['role'],
                    'department' => $spec['department'],
                    'grade' => $spec['grade'],
                    'section' => $spec['section'],
                    'lrn' => $spec['lrn'],
                    'school_year' => $spec['school_year'],
                    'status' => 'active',
                    'password' => $plainPassword,
                ]);
                $user->email_verified_at = $user->email_verified_at ?? now();
                $user->save();

                $primaryUserModels[] = $user;
            }

            // 5. Ensure known role-based @gmail.com accounts exist (preserving any existing DB role/fields)
            foreach (self::EXISTING_ROLE_GMAIL_ACCOUNTS as $spec) {
                $emailLower = strtolower($spec['email']);
                $existing = User::query()
                    ->whereRaw('LOWER(email) = ?', [$emailLower])
                    ->first();

                if (! $existing) {
                    if (! empty($spec['lrn'])) {
                        User::where('lrn', $spec['lrn'])
                            ->whereRaw('LOWER(email) != ?', [$emailLower])
                            ->update(['lrn' => null]);
                    }

                    $created = new User([
                        'email' => $emailLower,
                        'name' => $spec['name'],
                        'first_name' => $spec['first_name'],
                        'last_name' => $spec['last_name'],
                        'role' => $spec['role'],
                        'department' => $spec['department'],
                        'grade' => $spec['grade'],
                        'section' => $spec['section'],
                        'lrn' => $spec['lrn'],
                        'school_year' => $spec['school_year'],
                        'status' => 'active',
                        'password' => self::passwordForEmail($emailLower),
                    ]);
                    $created->email_verified_at = now();
                    $created->save();
                }
            }

            // 6. Normalize and assign all other @gmail.com accounts in the database based on their role
            $otherGmailUsers = User::query()
                ->whereRaw('LOWER(email) LIKE ?', ['%@gmail.com'])
                ->orderBy('id')
                ->get()
                ->reject(fn (User $u) => in_array(strtolower(trim($u->email)), $primaryEmailsLower, true))
                ->values();

            $availableDeanDepts = ['CAS', 'CBA', 'CCJPS', 'CHM', 'COM', 'CLIS'];
            $usedDeanDepts = ['CIT', 'CED'];
            $nextStudentLrnCounter = 20270003;

            foreach ($otherGmailUsers as $otherUser) {
                $emailLower = strtolower(trim($otherUser->email));
                $role = strtolower(trim((string) ($otherUser->role ?: 'student')));
                if (! in_array($role, ['student', 'teacher', 'secretary', 'dean', 'principal'], true)) {
                    $role = 'student';
                }

                $otherUser->email = $emailLower;
                $otherUser->role = $role === 'principal' ? 'dean' : $role;
                $otherUser->school_year = $otherUser->school_year ?: '2026-2027';
                $otherUser->status = 'active';
                $otherUser->email_verified_at = $otherUser->email_verified_at ?? now();

                if (empty($otherUser->first_name) && ! empty($otherUser->name)) {
                    $parts = preg_split('/\s+/', trim($otherUser->name)) ?: [];
                    $otherUser->first_name = $parts[0] ?? 'TCC';
                    $otherUser->last_name = count($parts) > 1 ? implode(' ', array_slice($parts, 1)) : 'Member';
                }

                if ($otherUser->role === 'student') {
                    $otherUser->department = strtoupper(trim((string) ($otherUser->department ?: 'CIT')));
                    $otherUser->grade = User::normalizeYearLevel($otherUser->grade, $otherUser->section) ?: '1st Year';
                    $otherUser->section = trim((string) ($otherUser->section ?: 'Block - 1A'));
                    if (empty($otherUser->lrn)) {
                        while (User::where('lrn', (string) $nextStudentLrnCounter)->where('id', '!=', $otherUser->id)->exists()) {
                            $nextStudentLrnCounter++;
                        }
                        $otherUser->lrn = (string) $nextStudentLrnCounter;
                        $nextStudentLrnCounter++;
                    }
                } elseif ($otherUser->role === 'teacher') {
                    $otherUser->department = strtoupper(trim((string) ($otherUser->department ?: 'CIT')));
                    $otherUser->grade = User::normalizeYearLevel($otherUser->grade) ?: '4th Year';
                    $otherUser->section = null;
                    $otherUser->lrn = null;
                } elseif ($otherUser->role === 'secretary') {
                    $otherUser->department = strtoupper(trim((string) ($otherUser->department ?: 'CIT')));
                    $otherUser->grade = null;
                    $otherUser->section = null;
                    $otherUser->lrn = null;
                } elseif ($otherUser->role === 'dean') {
                    $dept = strtoupper(trim((string) ($otherUser->department ?: 'CAS')));
                    if (in_array($dept, $usedDeanDepts, true)) {
                        $freeDept = null;
                        foreach ($availableDeanDepts as $candidateDept) {
                            if (! in_array($candidateDept, $usedDeanDepts, true)) {
                                $freeDept = $candidateDept;
                                break;
                            }
                        }
                        if ($freeDept !== null) {
                            $dept = $freeDept;
                        } else {
                            $otherUser->role = 'teacher';
                            $otherUser->department = 'CIT';
                            $otherUser->grade = '4th Year';
                            $otherUser->section = null;
                            $otherUser->lrn = null;
                        }
                    }

                    if ($otherUser->role === 'dean') {
                        $usedDeanDepts[] = $dept;
                        $otherUser->department = $dept;
                        $otherUser->grade = null;
                        $otherUser->section = null;
                        $otherUser->lrn = null;
                    }
                }

                $otherUser->password = self::passwordForEmail($emailLower);
                $otherUser->save();
            }

            // 7. Ensure College Blocks and BSIT Curriculum Subjects exist
            self::seedSectionsAndSubjects();

            // 8. Ensure Welcome Announcement is attributed to the CIT Dean (Christian Earl Sanolan)
            $citDean = User::query()->whereRaw('LOWER(email) = ?', ['sanolanchristianearl@gmail.com'])->first();
            $citSecretary = User::query()->whereRaw('LOWER(email) = ?', ['vinsmokeearl@gmail.com'])->first();

            if ($citDean && Schema::hasTable('announcements') && Announcement::count() === 0) {
                Announcement::create([
                    'user_id' => $citDean->id,
                    'title' => 'Welcome to Tagoloan Community College (TCC) Online Assessment Portal',
                    'content' => 'All BSIT 1st Year to 4th Year students are reminded to observe strict academic integrity during online assessments. Full-screen proctoring and AI study diagnostics are active for SY 2026-2027.',
                    'target_role' => null,
                    'is_pinned' => true,
                ]);
            }

            // Mark provisioned inside the transaction only after all DB changes succeed
            if (Schema::hasTable('system_settings')) {
                SystemSetting::set(
                    self::PROVISION_SETTING_KEY,
                    now()->toIso8601String(),
                    'string',
                    'Timestamp when demo accounts/quizzes were purged and real @gmail.com accounts were provisioned (v2).'
                );
            }

            return [
                'deleted_quizzes' => $deletedQuizzes,
                'deleted_demo_users' => $deletedDemoUsers,
                'primary_users' => $primaryUserModels,
                'other_users' => $otherGmailUsers->all(),
                'cit_dean' => $citDean,
                'cit_secretary' => $citSecretary,
            ];
        });

        $deletedQuizzes = $txResult['deleted_quizzes'];
        $deletedDemoUsers = $txResult['deleted_demo_users'];
        $primaryUserModels = $txResult['primary_users'];
        $otherGmailUsersList = $txResult['other_users'];
        $citDean = $txResult['cit_dean'];
        $citSecretary = $txResult['cit_secretary'];

        // 9. Dispatch credential emails outside the DB transaction:
        //    First -> the 3 assigned accounts (Christian Earl Sanolan, Louise Gutenberg, Charlie Viador)
        //    Last  -> all other @gmail.com accounts in the database based on their assigned role
        $emailResults = [];
        $knownPreDispatchedEmails = array_merge(
            array_map(fn (array $a) => strtolower($a['email']), self::PRIMARY_GMAIL_ACCOUNTS),
            array_map(fn (array $a) => strtolower($a['email']), self::EXISTING_ROLE_GMAIL_ACCOUNTS),
        );

        $orderedRecipients = array_merge($primaryUserModels, $otherGmailUsersList);
        $portalLoginUrl = 'https://learning-ms.online/login';

        if ($dispatchEmails) {
            config(['mail.mailers.smtp.timeout' => 5]);

            foreach ($orderedRecipients as $recipient) {
                $emailLower = strtolower(trim($recipient->email));
                if ($skipAlreadyDispatchedKnownEmails && in_array($emailLower, $knownPreDispatchedEmails, true)) {
                    continue;
                }

                $plainPassword = self::passwordForEmail($emailLower);
                $issuer = $recipient->isDeanRole() ? $citDean : ($citSecretary ?? $citDean);

                $mailable = new LmsAccountCreatedMail(
                    $recipient,
                    $plainPassword,
                    $issuer,
                    $portalLoginUrl
                );

                $dispatch = LmsMailService::dispatch(
                    $recipient->email,
                    $mailable,
                    "LMS Account Credentials ({$recipient->role})"
                );

                $emailResults[] = [
                    'email' => $recipient->email,
                    'name' => $recipient->name,
                    'role' => $recipient->role,
                    'department' => $recipient->department,
                    'grade' => $recipient->grade,
                    'section' => $recipient->section,
                    'password' => $plainPassword,
                    'sent' => $dispatch['sent'],
                    'status' => $dispatch['status'],
                    'warning' => $dispatch['warning'],
                ];

                // If external SMTP connection is blocked on this host, avoid stalling on remaining recipients
                if (! $dispatch['sent'] && ! $dispatch['simulated']) {
                    break;
                }
            }
        }

        $provisionedUsers = array_map(fn (User $u) => [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'role' => $u->role,
            'department' => $u->department,
            'grade' => $u->grade,
            'section' => $u->section,
            'lrn' => $u->lrn,
            'password' => self::passwordForEmail($u->email),
        ], $orderedRecipients);

        return [
            'deleted_quizzes' => $deletedQuizzes,
            'deleted_demo_users' => $deletedDemoUsers,
            'provisioned_users' => $provisionedUsers,
            'email_results' => $emailResults,
        ];
    }

    public static function seedSectionsAndSubjects(): void
    {
        if (Schema::hasTable('sections')) {
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
        }

        if (Schema::hasTable('subjects')) {
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
        }

        if (Schema::hasTable('system_settings')) {
            SystemSetting::where('key', 'maintenance_mode')->delete();
            SystemSetting::set('school_year', '2026-2027', 'string', 'Current school year');

            if (! SystemSetting::get('institutional_smtp')) {
                SystemSetting::set(
                    'institutional_smtp',
                    [
                        'mailer' => 'smtp',
                        'host' => 'smtp.gmail.com',
                        'port' => 587,
                        'username' => 'tcclms4@gmail.com',
                        'password' => 'qhxsarnndiyayuku',
                        'encryption' => 'tls',
                        'from_address' => 'tcclms4@gmail.com',
                        'from_name' => 'Tagoloan Community College LMS',
                    ],
                    'json',
                    'Global institutional Gmail SMTP credentials for reliable transactional dispatch and OTP delivery.'
                );
            }
        }
    }
}
