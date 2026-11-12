<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Unrecognized Device OTP Verification
    |--------------------------------------------------------------------------
    |
    | "auto"  - Require an emailed OTP for unrecognized devices only when a real
    |           mail transport (e.g. SMTP) is configured. When MAIL_MAILER is
    |           "log" or "array", logins continue and the new device is recorded
    |           as a security log so accounts are never locked out.
    | "true"  - Always require an emailed OTP for unrecognized devices.
    | "false" - Never require device OTP verification.
    |
    */

    'device_otp' => env('LMS_DEVICE_OTP', 'auto'),

    // Never expose OTP codes in API responses in production unless explicitly enabled for a demo deployment.
    'demo_otp_visible' => (bool) env('LMS_DEMO_OTP_VISIBLE', false),

    'otp_ttl_minutes' => (int) env('LMS_OTP_TTL_MINUTES', 10),

    'otp_max_attempts' => (int) env('LMS_OTP_MAX_ATTEMPTS', 5),

    'otp_resend_cooldown_seconds' => (int) env('LMS_OTP_RESEND_COOLDOWN', 60),

    /*
    |--------------------------------------------------------------------------
    | Session Lifetime ("Keep me signed in")
    |--------------------------------------------------------------------------
    */

    'remember_days' => (int) env('LMS_REMEMBER_DAYS', 30),

    'session_hours' => (int) env('LMS_SESSION_HOURS', 12),

    /*
    |--------------------------------------------------------------------------
    | Academic Calendar
    |--------------------------------------------------------------------------
    */

    'school_year' => env('LMS_SCHOOL_YEAR', '2026-2027'),

    /*
    |--------------------------------------------------------------------------
    | Departments (Colleges)
    |--------------------------------------------------------------------------
    |
    | Every account, quiz, section, and subject belongs to exactly one college.
    | Data is isolated per college: e.g. CIT quizzes are only visible to CIT
    | students and CIT staff.
    |
    */

    'default_department' => 'CIT',

    'departments' => [
        'CIT' => 'College of Information Technology',
        'CED' => 'College of Education',
        'CAS' => 'College of Arts and Sciences',
        'CCJPS' => 'College of Criminal Justice and Public Safety',
        'CBA' => 'College of Business Administration',
        'CHM' => 'College of Hospitality Management',
        'COM' => 'College of Midwifery',
        'CLIS' => 'College of Library Information Science',
    ],

];
