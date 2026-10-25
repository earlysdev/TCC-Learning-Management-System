-- ============================================================================
-- Tagoloan Community College (TCC) - Web-Based Learning Management System
-- Course: IT 116 - Advanced Database System
-- Database: u881832908_wyut_tcc_lms
-- Standard: Strict 3NF + Role Lookup (roles) & Role Identity Specialization
--           (users -> students, teachers, secretaries, deans)
-- Connectivity: 100% Physical Foreign Key Constraints Across All 23 Tables
-- ============================================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. TABLE: roles (RBAC Lookup Entity - Eliminates Repeated Role Strings)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `role_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_code` varchar(32) NOT NULL,
  `role_title` varchar(60) NOT NULL,
  `default_portal_route` varchar(100) NOT NULL,
  `role_description` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uk_roles_code` (`role_code`),
  UNIQUE KEY `uk_roles_title` (`role_title`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `roles` (`role_id`, `role_code`, `role_title`, `default_portal_route`, `role_description`) VALUES
(1, 'student', 'Student', '/student/dashboard', 'Takes proctored assessments and receives personalized AI study diagnostics.'),
(2, 'teacher', 'Teacher', '/teacher/dashboard', 'Authors BSIT course assessments, manages question banks, and monitors submissions.'),
(3, 'secretary', 'Secretary', '/secretary/dashboard', 'Manages student enrollment, year-level college blocks, and account activation.'),
(4, 'dean', 'College Dean', '/dean/dashboard', 'Governs global academic settings, audits system activity, and resolves security alerts.');

-- ----------------------------------------------------------------------------
-- 2. TABLE: users (Shared Supertype Authentication & Account Identity)
-- 3NF Note: Contains ONLY attributes common to all institutional accounts.
--           Role-specific attributes are separated into `students`, `teachers`,
--           `secretaries`, and `deans` (zero sparse NULL columns).
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `user_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_id` bigint(20) UNSIGNED NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `account_status` varchar(20) NOT NULL DEFAULT 'active',
  `password_hash` varchar(255) NOT NULL,
  `remember_token` varchar(100) DEFAULT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `last_active_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uk_users_email` (`email`),
  KEY `idx_users_role_id` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `users` (`user_id`, `role_id`, `first_name`, `last_name`, `email`, `account_status`, `password_hash`, `remember_token`, `email_verified_at`, `last_active_at`, `created_at`, `updated_at`) VALUES
(1, 1, 'Atan', 'Villanueva', 'student@tcc.edu.ph', 'active', '$2y$12$Cso03tCyDy6mvWmzG6H0TeUirnnn8lBg.UGU6v1n.QI.9OlOF3jOa', NULL, '2026-10-24 12:49:34', '2026-10-24 14:55:20', '2026-10-24 12:49:34', '2026-10-24 14:55:20'),
(2, 2, 'Kay', 'Waga', 'teacher@tcc.edu.ph', 'active', '$2y$12$JjDRPIy8d.uIXbhCDKw1zOiORwkema/Q7mqMmS5CtLTWKp8mw.qWO', NULL, '2026-10-24 12:49:34', '2026-10-24 14:51:47', '2026-10-24 12:49:34', '2026-10-24 14:51:47'),
(3, 3, 'Nikko', 'Perez', 'secretary@tcc.edu.ph', 'active', '$2y$12$HQMGwIBDPetuGW4BYgA/bOFILyoG/JW3uGN8jCGOyct0DI4EaK4SG', NULL, '2026-10-24 12:49:34', '2026-10-24 14:53:02', '2026-10-24 12:49:34', '2026-10-24 14:53:02'),
(4, 4, 'Gabriel', 'Casiño', 'dean@tcc.edu.ph', 'active', '$2y$12$AKEIVHbA0W2WQmpmYEe0AuX09Ihx4nKYZzEd/86DvE7gP.VEJnC6C', NULL, '2026-10-24 12:49:34', '2026-10-24 14:55:51', '2026-10-24 12:49:34', '2026-10-24 14:55:51');

-- ----------------------------------------------------------------------------
-- 3. TABLE: deans (Role Identity Subtype: College Dean)
-- Purpose: Governs `system_settings` and resolves `security_logs` incidents.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `deans`;
CREATE TABLE `deans` (
  `dean_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `employee_code` varchar(32) NOT NULL,
  `college_office` varchar(100) NOT NULL DEFAULT 'Office of the BSIT College Dean',
  `term_start_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`dean_id`),
  UNIQUE KEY `uk_deans_user_id` (`user_id`),
  UNIQUE KEY `uk_deans_employee_code` (`employee_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `deans` (`dean_id`, `user_id`, `employee_code`, `college_office`, `term_start_date`) VALUES
(1, 4, 'TCC-DEAN-001', 'Office of the BSIT College Dean', '2025-08-01');

-- ----------------------------------------------------------------------------
-- 4. TABLE: secretaries (Role Identity Subtype: College Secretary / Registrar)
-- Purpose: Manages `sections` (College Blocks) and enrolls `students`.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `secretaries`;
CREATE TABLE `secretaries` (
  `secretary_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `employee_code` varchar(32) NOT NULL,
  `office_department` varchar(100) NOT NULL DEFAULT 'Secretary & Registrar Office',
  `assigned_at` timestamp NULL DEFAULT current_timestamp(),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`secretary_id`),
  UNIQUE KEY `uk_secretaries_user_id` (`user_id`),
  UNIQUE KEY `uk_secretaries_employee_code` (`employee_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `secretaries` (`secretary_id`, `user_id`, `employee_code`, `office_department`) VALUES
(1, 3, 'TCC-REG-001', 'Secretary & Registrar Office');

-- ----------------------------------------------------------------------------
-- 5. TABLE: teachers (Role Identity Subtype: BSIT Faculty / Instructor)
-- Purpose: Teaches `subjects` and authors/publishes `quizzes`.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `teachers`;
CREATE TABLE `teachers` (
  `teacher_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `employee_code` varchar(32) NOT NULL,
  `department_code` varchar(60) NOT NULL DEFAULT 'BSIT',
  `academic_specialization` varchar(120) DEFAULT NULL,
  `hired_at` timestamp NULL DEFAULT current_timestamp(),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`teacher_id`),
  UNIQUE KEY `uk_teachers_user_id` (`user_id`),
  UNIQUE KEY `uk_teachers_employee_code` (`employee_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `teachers` (`teacher_id`, `user_id`, `employee_code`, `department_code`, `academic_specialization`) VALUES
(1, 2, 'TCC-FAC-001', 'BSIT', 'Database & Information Systems');

-- ----------------------------------------------------------------------------
-- 6. TABLE: system_settings (Global Academic Configuration)
-- Purpose: Configured by `deans` and referenced by `students` for active school year.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `system_settings`;
CREATE TABLE `system_settings` (
  `setting_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `configured_by_dean_id` bigint(20) UNSIGNED DEFAULT NULL,
  `setting_key` varchar(100) NOT NULL,
  `setting_value` text DEFAULT NULL,
  `value_type` varchar(32) NOT NULL DEFAULT 'string',
  `setting_description` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_id`),
  UNIQUE KEY `uk_system_settings_key` (`setting_key`),
  KEY `idx_system_settings_dean_id` (`configured_by_dean_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `system_settings` (`setting_id`, `configured_by_dean_id`, `setting_key`, `setting_value`, `value_type`, `setting_description`, `created_at`, `updated_at`) VALUES
(1, 1, 'school_year', '2025-2026', 'string', 'Current school year', '2026-10-24 12:49:34', '2026-10-24 12:49:34');

-- ----------------------------------------------------------------------------
-- 7. TABLE: sections (20 Official Year-Level College Blocks)
-- 3NF Note: Managed by `secretaries`; determines student `year_level` (no redundancy).
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `sections`;
CREATE TABLE `sections` (
  `section_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `managed_by_secretary_id` bigint(20) UNSIGNED DEFAULT NULL,
  `section_name` varchar(60) NOT NULL,
  `year_level` varchar(20) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`section_id`),
  UNIQUE KEY `uk_sections_section_name` (`section_name`),
  KEY `idx_sections_secretary_id` (`managed_by_secretary_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `sections` (`section_id`, `managed_by_secretary_id`, `section_name`, `year_level`, `created_at`, `updated_at`) VALUES
(1, 1, 'Block - 1A', '1st Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(2, 1, 'Block - 1B', '1st Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(3, 1, 'Block - 1C', '1st Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(4, 1, 'Block - 1D', '1st Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(5, 1, 'Block - 1E', '1st Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(6, 1, 'Block - 2A', '2nd Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(7, 1, 'Block - 2B', '2nd Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(8, 1, 'Block - 2C', '2nd Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(9, 1, 'Block - 2D', '2nd Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(10, 1, 'Block - 2E', '2nd Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(11, 1, 'Block - 3A', '3rd Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(12, 1, 'Block - 3B', '3rd Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(13, 1, 'Block - 3C', '3rd Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(14, 1, 'Block - 3D', '3rd Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(15, 1, 'Block - 3E', '3rd Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(16, 1, 'Block - 4A', '4th Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(17, 1, 'Block - 4B', '4th Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(18, 1, 'Block - 4C', '4th Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(19, 1, 'Block - 4D', '4th Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(20, 1, 'Block - 4E', '4th Year', '2026-10-24 12:49:34', '2026-10-24 12:49:34');

-- ----------------------------------------------------------------------------
-- 8. TABLE: students (Role Identity Subtype: Enrolled Student)
-- Purpose: Holds mandatory `student_lrn` and `section_id`; owns `quiz_attempts`.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `students`;
CREATE TABLE `students` (
  `student_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `section_id` bigint(20) UNSIGNED NOT NULL,
  `school_year_setting_id` bigint(20) UNSIGNED NOT NULL,
  `enrolled_by_secretary_id` bigint(20) UNSIGNED DEFAULT NULL,
  `student_lrn` varchar(32) NOT NULL,
  `enrollment_status` varchar(20) NOT NULL DEFAULT 'regular',
  `enrolled_at` timestamp NULL DEFAULT current_timestamp(),
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`student_id`),
  UNIQUE KEY `uk_students_user_id` (`user_id`),
  UNIQUE KEY `uk_students_student_lrn` (`student_lrn`),
  KEY `idx_students_section_id` (`section_id`),
  KEY `idx_students_school_year_setting_id` (`school_year_setting_id`),
  KEY `idx_students_enrolled_by_secretary_id` (`enrolled_by_secretary_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `students` (`student_id`, `user_id`, `section_id`, `school_year_setting_id`, `enrolled_by_secretary_id`, `student_lrn`, `enrollment_status`, `enrolled_at`) VALUES
(1, 1, 1, 1, 1, '20273710', 'regular', '2026-10-24 12:49:34');

-- ----------------------------------------------------------------------------
-- 9. TABLE: subjects (All 43 Official BSIT Curriculum Courses)
-- Purpose: Assigned to `teachers` and aligned with `sections` year level.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `subjects`;
CREATE TABLE `subjects` (
  `subject_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `assigned_teacher_id` bigint(20) UNSIGNED DEFAULT NULL,
  `default_section_id` bigint(20) UNSIGNED DEFAULT NULL,
  `subject_code` varchar(30) NOT NULL,
  `subject_name` varchar(100) NOT NULL,
  `year_level` varchar(30) NOT NULL DEFAULT '1st Year',
  `department_code` varchar(60) NOT NULL DEFAULT 'BSIT',
  `subject_description` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`subject_id`),
  UNIQUE KEY `uk_subjects_code` (`subject_code`),
  UNIQUE KEY `uk_subjects_name` (`subject_name`),
  KEY `idx_subjects_assigned_teacher_id` (`assigned_teacher_id`),
  KEY `idx_subjects_default_section_id` (`default_section_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `subjects` (`subject_id`, `assigned_teacher_id`, `default_section_id`, `subject_code`, `subject_name`, `year_level`, `department_code`, `subject_description`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'PATH FIT 1', 'Movement Competency Training', '1st Year', 'BSIT', 'Movement Competency Training', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(2, 1, 1, 'GEC 1', 'Understanding the Self', '1st Year', 'BSIT', 'Understanding the Self', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(3, 1, 1, 'IT 101', 'Introduction To Computing', '1st Year', 'BSIT', 'Introduction To Computing', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(4, 1, 1, 'IT 102', 'Computer Programming 1', '1st Year', 'BSIT', 'Computer Programming 1', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(5, 1, 1, 'IT 103', 'Integrated Application Software', '1st Year', 'BSIT', 'Integrated Application Software', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(6, 1, 1, 'Math 1', 'College Algebra', '1st Year', 'BSIT', 'College Algebra', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(7, 1, 1, 'Math 2', 'Plane Trigonometry', '1st Year', 'BSIT', 'Plane Trigonometry', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(8, 1, 1, 'NSTP 1', 'CWTS/ROTC 1', '1st Year', 'BSIT', 'CWTS/ROTC 1', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(9, 1, 1, 'ROTC/CWTS 102', 'Reserved Officer Training Corps/CWTS', '1st Year', 'BSIT', 'Reserved Officer Training Corps/CWTS', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(10, 1, 1, 'IT 105', 'Computer Programming 2', '1st Year', 'BSIT', 'Computer Programming 2', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(11, 1, 1, 'IT 106', 'Digital Logic Design', '1st Year', 'BSIT', 'Digital Logic Design', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(12, 1, 1, 'PATH FIT 2', 'Fitness Training', '1st Year', 'BSIT', 'Fitness Training', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(13, 1, 1, 'IT 104', 'Information Technology Fundamentals', '1st Year', 'BSIT', 'Information Technology Fundamentals', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(14, 1, 1, 'Math 3', 'Pre-Calculus', '1st Year', 'BSIT', 'Pre-Calculus', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(15, 1, 1, 'GEC 2', 'READING IN PHILIPPINE HISTORY', '1st Year', 'BSIT', 'READING IN PHILIPPINE HISTORY', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(16, 1, 6, 'PATH FIT 3', 'DANCE SPORTS & INDIVIDUAL/GROUP EXERCISE/OUTDOOR', '2nd Year', 'BSIT', 'DANCE SPORTS & INDIVIDUAL/GROUP EXERCISE/OUTDOOR', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(17, 1, 6, 'GEC 3', 'The Contemporary World', '2nd Year', 'BSIT', 'The Contemporary World', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(18, 1, 6, 'IT 107', 'Application Development & Emerging Technologies', '2nd Year', 'BSIT', 'Application Development & Emerging Technologies', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(19, 1, 6, 'IT 108', 'Data Structures & Algorithms', '2nd Year', 'BSIT', 'Data Structures & Algorithms', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(20, 1, 6, 'IT 109', 'Fundamentals of Database Systems', '2nd Year', 'BSIT', 'Fundamentals of Database Systems', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(21, 1, 6, 'IT 110', 'Object Oriented Programming (OOP)', '2nd Year', 'BSIT', 'Object Oriented Programming (OOP)', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(22, 1, 6, 'IT 111', 'Social Issues & Professional Issues', '2nd Year', 'BSIT', 'Social Issues & Professional Issues', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(23, 1, 6, 'IT 112', 'Information Management 1', '2nd Year', 'BSIT', 'Information Management 1', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(24, 1, 6, 'IT 113', 'Event-Driven Programming', '2nd Year', 'BSIT', 'Event-Driven Programming', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(25, 1, 6, 'IT 114', 'Integrative Programming & Technologies 1', '2nd Year', 'BSIT', 'Integrative Programming & Technologies 1', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(26, 1, 6, 'IT 115', 'Human Computer Interaction 1', '2nd Year', 'BSIT', 'Human Computer Interaction 1', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(27, 1, 6, 'IT 116', 'Advanced Database System', '2nd Year', 'BSIT', 'Advanced Database System', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(28, 1, 6, 'PATH FIT 4', 'Team Sports', '2nd Year', 'BSIT', 'Team Sports', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(29, 1, 6, 'GEC 4', 'Mathematics in the Modern World', '2nd Year', 'BSIT', 'Mathematics in the Modern World', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(30, 1, 6, 'GEE 6', 'Art Appreciation', '2nd Year', 'BSIT', 'Art Appreciation', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(31, 1, 6, 'GEE 8', 'Ethics', '2nd Year', 'BSIT', 'Ethics', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(32, 1, 6, 'IT 117', 'QualitativeMethods(Modeling&Simulation)', '2nd Year', 'BSIT', 'QualitativeMethods(Modeling&Simulation)', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(33, 1, 6, 'IT 118', 'Human Computer Interaction 2', '2nd Year', 'BSIT', 'Human Computer Interaction 2', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(34, 1, 6, 'IT Elec 1', 'System Analysis and Design (SAD)', '2nd Year', 'BSIT', 'System Analysis and Design (SAD)', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(35, 1, 11, 'IT 119', 'System Integration & Architecture 1', '3rd Year', 'BSIT', 'System Integration & Architecture 1', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(36, 1, 11, 'IT 120', 'Research1 (Methods of Research in Computing)', '3rd Year', 'BSIT', 'Research1 (Methods of Research in Computing)', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(37, 1, 11, 'IT 121', 'Information Management 2', '3rd Year', 'BSIT', 'Information Management 2', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(38, 1, 11, 'IT 122', 'Integrative Programming & Technologies 2', '3rd Year', 'BSIT', 'Integrative Programming & Technologies 2', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(39, 1, 11, 'IT Elec 2', 'Computer Graphics', '3rd Year', 'BSIT', 'Computer Graphics', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(40, 1, 11, 'GEC 5', 'Purposive Communication', '3rd Year', 'BSIT', 'Purposive Communication', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(41, 1, 11, 'GEC 7', 'Science, Technology, and Society', '3rd Year', 'BSIT', 'Science, Technology, and Society', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(42, 1, 11, 'GEC 9', 'Life, Works & Writing of Dr. Jose Rizal', '3rd Year', 'BSIT', 'Life, Works & Writing of Dr. Jose Rizal', '2026-10-24 12:49:34', '2026-10-24 12:49:34'),
(43, 1, 11, 'GEE 9', 'Technoprenuership (The Entrepreneurial Mind)', '3rd Year', 'BSIT', 'Technoprenuership (The Entrepreneurial Mind)', '2026-10-24 12:49:34', '2026-10-24 12:49:34');

-- ----------------------------------------------------------------------------
-- 10. TABLE: quizzes (Teacher-Owned Assessment Headers)
-- Purpose: References `teachers.teacher_id` and `subjects.subject_id` directly.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `quizzes`;
CREATE TABLE `quizzes` (
  `quiz_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `teacher_id` bigint(20) UNSIGNED NOT NULL,
  `subject_id` bigint(20) UNSIGNED NOT NULL,
  `quiz_title` varchar(200) NOT NULL,
  `topic_name` varchar(120) NOT NULL,
  `instructions_text` text DEFAULT NULL,
  `target_scope` varchar(24) NOT NULL DEFAULT 'all',
  `time_limit_minutes` smallint(5) UNSIGNED DEFAULT 15,
  `is_published` tinyint(1) NOT NULL DEFAULT 0,
  `is_shuffled` tinyint(1) NOT NULL DEFAULT 0,
  `allow_review` tinyint(1) NOT NULL DEFAULT 1,
  `is_ai_generated` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`quiz_id`),
  KEY `idx_quizzes_teacher_id` (`teacher_id`),
  KEY `idx_quizzes_subject_id` (`subject_id`),
  KEY `idx_quizzes_published_subject` (`is_published`, `subject_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `quizzes` (`quiz_id`, `teacher_id`, `subject_id`, `quiz_title`, `topic_name`, `instructions_text`, `target_scope`, `time_limit_minutes`, `is_published`, `is_shuffled`, `allow_review`, `is_ai_generated`, `created_at`, `updated_at`) VALUES
(1, 1, 27, 'Beginner', 'Database', 'Choose the best answer for each question. Alt-tabbing, taking screenshots, or opening developer tools is strictly prohibited and monitored.', 'individual', 15, 1, 0, 1, 0, '2026-10-24 14:30:28', '2026-10-24 14:50:32');

-- ----------------------------------------------------------------------------
-- 11. TABLE: quiz_questions (Normalized Atomic Questions - 3NF)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `quiz_questions`;
CREATE TABLE `quiz_questions` (
  `question_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `quiz_id` bigint(20) UNSIGNED NOT NULL,
  `prompt_text` text NOT NULL,
  `competency_skill` varchar(120) DEFAULT NULL,
  `points_value` smallint(5) UNSIGNED NOT NULL DEFAULT 1,
  `display_order` smallint(5) UNSIGNED NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`question_id`),
  KEY `idx_quiz_questions_quiz_id` (`quiz_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `quiz_questions` (`question_id`, `quiz_id`, `prompt_text`, `competency_skill`, `points_value`, `display_order`) VALUES
(1, 1, 'What does DBMS stand for?', 'Database', 15, 1);

-- ----------------------------------------------------------------------------
-- 12. TABLE: quiz_question_options (Normalized Atomic Choices - 3NF)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `quiz_question_options`;
CREATE TABLE `quiz_question_options` (
  `option_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `question_id` bigint(20) UNSIGNED NOT NULL,
  `option_text` varchar(500) NOT NULL,
  `is_correct` tinyint(1) NOT NULL DEFAULT 0,
  `option_order` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`option_id`),
  KEY `idx_question_options_question_id` (`question_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `quiz_question_options` (`option_id`, `question_id`, `option_text`, `is_correct`, `option_order`) VALUES
(1, 1, 'Database Management System', 1, 0),
(2, 1, 'Data Backup Management Software', 0, 1),
(3, 1, 'Digital Base Management System', 0, 2),
(4, 1, 'Database Monitoring Service', 0, 3);

-- ----------------------------------------------------------------------------
-- 13. TABLE: quiz_assignments (Normalized Quiz Targeting Junction Table - 3NF)
-- Purpose: Links `quizzes` to target `sections` or individual `students`.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `quiz_assignments`;
CREATE TABLE `quiz_assignments` (
  `assignment_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `quiz_id` bigint(20) UNSIGNED NOT NULL,
  `section_id` bigint(20) UNSIGNED DEFAULT NULL,
  `student_id` bigint(20) UNSIGNED DEFAULT NULL,
  `assigned_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`assignment_id`),
  KEY `idx_quiz_assignments_quiz_id` (`quiz_id`),
  KEY `idx_quiz_assignments_section_id` (`section_id`),
  KEY `idx_quiz_assignments_student_id` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `quiz_assignments` (`assignment_id`, `quiz_id`, `section_id`, `student_id`, `assigned_at`) VALUES
(1, 1, 1, 1, '2026-10-24 14:50:32');

-- ----------------------------------------------------------------------------
-- 14. TABLE: quiz_attempts (Student-Owned Exam Submissions - 3NF)
-- Purpose: References `students.student_id` directly (only Students take exams).
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `quiz_attempts`;
CREATE TABLE `quiz_attempts` (
  `attempt_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `quiz_id` bigint(20) UNSIGNED NOT NULL,
  `student_id` bigint(20) UNSIGNED NOT NULL,
  `earned_score` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `cheating_incidents_count` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `client_ip_address` varchar(45) DEFAULT NULL,
  `client_user_agent` text DEFAULT NULL,
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`attempt_id`),
  UNIQUE KEY `uk_quiz_attempts_quiz_student` (`quiz_id`, `student_id`),
  KEY `idx_quiz_attempts_student_id` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `quiz_attempts` (`attempt_id`, `quiz_id`, `student_id`, `earned_score`, `cheating_incidents_count`, `client_ip_address`, `client_user_agent`, `started_at`, `completed_at`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 15, 0, '143.44.192.193', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', '2026-10-24 14:51:01', '2026-10-24 14:51:10', '2026-10-24 14:51:10', '2026-10-24 14:51:10');

-- ----------------------------------------------------------------------------
-- 15. TABLE: quiz_attempt_answers (Normalized Atomic Student Responses - 3NF)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `quiz_attempt_answers`;
CREATE TABLE `quiz_attempt_answers` (
  `attempt_answer_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `attempt_id` bigint(20) UNSIGNED NOT NULL,
  `question_id` bigint(20) UNSIGNED NOT NULL,
  `selected_option_id` bigint(20) UNSIGNED NOT NULL,
  `is_correct` tinyint(1) NOT NULL DEFAULT 0,
  `points_awarded` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`attempt_answer_id`),
  UNIQUE KEY `uk_attempt_answers_attempt_question` (`attempt_id`, `question_id`),
  KEY `idx_attempt_answers_question_id` (`question_id`),
  KEY `idx_attempt_answers_selected_option_id` (`selected_option_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `quiz_attempt_answers` (`attempt_answer_id`, `attempt_id`, `question_id`, `selected_option_id`, `is_correct`, `points_awarded`) VALUES
(1, 1, 1, 1, 1, 15);

-- ----------------------------------------------------------------------------
-- 16. TABLE: quiz_recommendations (Normalized AI Study Diagnostics - 3NF)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `quiz_recommendations`;
CREATE TABLE `quiz_recommendations` (
  `recommendation_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `attempt_id` bigint(20) UNSIGNED NOT NULL,
  `summary_feedback` text NOT NULL,
  `focus_topics_text` text DEFAULT NULL,
  `action_steps_text` text NOT NULL,
  `generation_source` varchar(32) NOT NULL DEFAULT 'local',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`recommendation_id`),
  UNIQUE KEY `uk_quiz_recommendations_attempt_id` (`attempt_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `quiz_recommendations` (`recommendation_id`, `attempt_id`, `summary_feedback`, `focus_topics_text`, `action_steps_text`, `generation_source`, `created_at`) VALUES
(1, 1, 'Outstanding work! You demonstrated complete mastery across all tested learning competencies for Database.', NULL, 'Proceed to subsequent modules or challenge yourself with advanced problem sets in Database. | Share your mastery and mentor peers reviewing this unit.', 'local', '2026-10-24 14:51:10');

-- ----------------------------------------------------------------------------
-- 17. TABLE: recommendation_references (Normalized Study Links - 3NF)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `recommendation_references`;
CREATE TABLE `recommendation_references` (
  `reference_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `recommendation_id` bigint(20) UNSIGNED NOT NULL,
  `resource_title` varchar(200) NOT NULL,
  `resource_url` varchar(500) NOT NULL,
  `source_provider` varchar(100) NOT NULL,
  `resource_description` text DEFAULT NULL,
  PRIMARY KEY (`reference_id`),
  KEY `idx_recommendation_refs_rec_id` (`recommendation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `recommendation_references` (`reference_id`, `recommendation_id`, `resource_title`, `resource_url`, `source_provider`, `resource_description`) VALUES
(1, 1, 'Khan Academy: Database Study Module', 'https://www.khanacademy.org/search?page_search_query=Database', 'Khan Academy', 'Interactive lessons, video walkthroughs, and practice problems focused on Database.'),
(2, 1, 'Wikipedia Knowledge Base: Database', 'https://en.wikipedia.org/wiki/Special:Search?search=Database', 'Wikipedia Library', 'Academic summaries, diagrams, and comprehensive definitions for Database.'),
(3, 1, 'DepEd LR Portal Competency: Database', 'https://lrmds.deped.gov.ph/search?query=Database', 'DepEd Learning Resource', 'Official curriculum guides and self-learning modules for Database.');

-- ----------------------------------------------------------------------------
-- 18. TABLE: announcements (Role-Targeted Campus Broadcasts)
-- 3NF Note: Replaces `target_role` string with `target_role_id` FK -> roles.role_id
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `announcements`;
CREATE TABLE `announcements` (
  `announcement_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `author_user_id` bigint(20) UNSIGNED NOT NULL,
  `target_role_id` bigint(20) UNSIGNED DEFAULT NULL,
  `announcement_title` varchar(255) NOT NULL,
  `announcement_content` text NOT NULL,
  `is_pinned` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`announcement_id`),
  KEY `idx_announcements_author_user_id` (`author_user_id`),
  KEY `idx_announcements_target_role_id` (`target_role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `announcements` (`announcement_id`, `author_user_id`, `target_role_id`, `announcement_title`, `announcement_content`, `is_pinned`, `created_at`, `updated_at`) VALUES
(1, 4, 1, 'Welcome to Tagoloan Community College (TCC) Online Assessment Portal', 'All BSIT 1st Year to 4th Year students are reminded to observe strict academic integrity during online assessments.', 1, '2026-10-24 12:49:34', '2026-10-24 12:49:34');

-- ----------------------------------------------------------------------------
-- 19. TABLE: notifications (Real-Time User & Role Alerts)
-- 3NF Note: Links directly to `users`, `roles`, `quizzes`, and `announcements`.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `notification_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `recipient_user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `recipient_role_id` bigint(20) UNSIGNED DEFAULT NULL,
  `quiz_id` bigint(20) UNSIGNED DEFAULT NULL,
  `announcement_id` bigint(20) UNSIGNED DEFAULT NULL,
  `notification_type` varchar(50) NOT NULL,
  `notification_title` varchar(255) NOT NULL,
  `notification_message` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`notification_id`),
  KEY `idx_notifications_recipient_user_id` (`recipient_user_id`),
  KEY `idx_notifications_recipient_role_id` (`recipient_role_id`),
  KEY `idx_notifications_quiz_id` (`quiz_id`),
  KEY `idx_notifications_announcement_id` (`announcement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `notifications` (`notification_id`, `recipient_user_id`, `recipient_role_id`, `quiz_id`, `announcement_id`, `notification_type`, `notification_title`, `notification_message`, `is_read`, `read_at`) VALUES
(1, 1, 1, 1, 1, 'quiz_published', 'New Quiz: Beginner', 'IT 116 - Advanced Database System (Database) is now open for taking.', 0, NULL);

-- ----------------------------------------------------------------------------
-- 20. TABLE: activity_logs (Administrative & User Audit Trail)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `activity_logs`;
CREATE TABLE `activity_logs` (
  `activity_log_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `action_name` varchar(100) NOT NULL,
  `action_description` text DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`activity_log_id`),
  KEY `idx_activity_logs_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `activity_logs` (`activity_log_id`, `user_id`, `action_name`, `action_description`, `ip_address`, `user_agent`, `created_at`) VALUES
(1, 2, 'create_quiz', 'Created manual quiz "Beginner" (IT 116 - Advanced Database System)', '143.44.192.193', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', '2026-10-24 14:30:28'),
(2, 1, 'submit_quiz', 'Submitted quiz "Beginner" (Score: 15/15)', '143.44.192.193', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', '2026-10-24 14:51:10');

-- ----------------------------------------------------------------------------
-- 21. TABLE: security_logs (Proctoring Violations & Dean Incident Resolution)
-- Purpose: Audited and resolved by `deans` (`resolved_by_dean_id`).
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `security_logs`;
CREATE TABLE `security_logs` (
  `security_log_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `quiz_id` bigint(20) UNSIGNED DEFAULT NULL,
  `attempt_id` bigint(20) UNSIGNED DEFAULT NULL,
  `resolved_by_dean_id` bigint(20) UNSIGNED DEFAULT NULL,
  `event_type` varchar(100) NOT NULL,
  `violation_details` varchar(255) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `is_resolved` tinyint(1) NOT NULL DEFAULT 0,
  `resolved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`security_log_id`),
  KEY `idx_security_logs_user_id` (`user_id`),
  KEY `idx_security_logs_quiz_id` (`quiz_id`),
  KEY `idx_security_logs_attempt_id` (`attempt_id`),
  KEY `idx_security_logs_resolved_by_dean_id` (`resolved_by_dean_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `security_logs` (`security_log_id`, `user_id`, `quiz_id`, `attempt_id`, `resolved_by_dean_id`, `event_type`, `violation_details`, `ip_address`, `user_agent`, `is_resolved`, `resolved_at`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 1, 1, 'login_success', 'Authenticated student examination session', '143.44.192.193', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 1, '2026-10-24 14:51:10', '2026-10-24 14:50:51', '2026-10-24 14:51:10');

-- ----------------------------------------------------------------------------
-- 22. TABLE: personal_access_tokens (Sanctum Bearer Authentication)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `personal_access_tokens`;
CREATE TABLE `personal_access_tokens` (
  `token_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `token_name` varchar(100) NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `abilities` varchar(255) DEFAULT NULL,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`token_id`),
  UNIQUE KEY `uk_personal_access_tokens_hash` (`token_hash`),
  KEY `idx_personal_access_tokens_user_id` (`user_id`),
  KEY `idx_personal_access_tokens_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 23. TABLE: sessions & password_reset_tokens (Session & Recovery Security)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS `sessions`;
CREATE TABLE `sessions` (
  `session_id` varchar(255) NOT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `session_payload` longtext NOT NULL,
  `last_activity` int(11) NOT NULL,
  PRIMARY KEY (`session_id`),
  KEY `idx_sessions_user_id` (`user_id`),
  KEY `idx_sessions_last_activity` (`last_activity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `password_reset_tokens`;
CREATE TABLE `password_reset_tokens` (
  `reset_token_id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `reset_token` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`reset_token_id`),
  KEY `idx_password_reset_tokens_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS (100% TABLE CONNECTIVITY ACROSS ALL 23 ENTITIES)
-- ============================================================================

-- 1. Role Lookup & Role-Specific Identity Specialization Constraints
ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_role_id` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `deans`
  ADD CONSTRAINT `fk_deans_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `secretaries`
  ADD CONSTRAINT `fk_secretaries_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `teachers`
  ADD CONSTRAINT `fk_teachers_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `students`
  ADD CONSTRAINT `fk_students_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_students_section_id` FOREIGN KEY (`section_id`) REFERENCES `sections` (`section_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_students_school_year_setting_id` FOREIGN KEY (`school_year_setting_id`) REFERENCES `system_settings` (`setting_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_students_enrolled_by_secretary_id` FOREIGN KEY (`enrolled_by_secretary_id`) REFERENCES `secretaries` (`secretary_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Role-Owned Academic Structure & Governance Constraints
ALTER TABLE `system_settings`
  ADD CONSTRAINT `fk_system_settings_dean_id` FOREIGN KEY (`configured_by_dean_id`) REFERENCES `deans` (`dean_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `sections`
  ADD CONSTRAINT `fk_sections_secretary_id` FOREIGN KEY (`managed_by_secretary_id`) REFERENCES `secretaries` (`secretary_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `subjects`
  ADD CONSTRAINT `fk_subjects_assigned_teacher_id` FOREIGN KEY (`assigned_teacher_id`) REFERENCES `teachers` (`teacher_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_subjects_default_section_id` FOREIGN KEY (`default_section_id`) REFERENCES `sections` (`section_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Teacher-Owned Assessment & Question Bank Constraints
ALTER TABLE `quizzes`
  ADD CONSTRAINT `fk_quizzes_teacher_id` FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`teacher_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_quizzes_subject_id` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`subject_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `quiz_questions`
  ADD CONSTRAINT `fk_quiz_questions_quiz_id` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`quiz_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `quiz_question_options`
  ADD CONSTRAINT `fk_question_options_question_id` FOREIGN KEY (`question_id`) REFERENCES `quiz_questions` (`question_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `quiz_assignments`
  ADD CONSTRAINT `fk_quiz_assignments_quiz_id` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`quiz_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_quiz_assignments_section_id` FOREIGN KEY (`section_id`) REFERENCES `sections` (`section_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_quiz_assignments_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Student-Owned Submissions, Answers & AI Recommendations Constraints
ALTER TABLE `quiz_attempts`
  ADD CONSTRAINT `fk_quiz_attempts_quiz_id` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`quiz_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_quiz_attempts_student_id` FOREIGN KEY (`student_id`) REFERENCES `students` (`student_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `quiz_attempt_answers`
  ADD CONSTRAINT `fk_attempt_answers_attempt_id` FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts` (`attempt_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_attempt_answers_question_id` FOREIGN KEY (`question_id`) REFERENCES `quiz_questions` (`question_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_attempt_answers_selected_option_id` FOREIGN KEY (`selected_option_id`) REFERENCES `quiz_question_options` (`option_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `quiz_recommendations`
  ADD CONSTRAINT `fk_quiz_recommendations_attempt_id` FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts` (`attempt_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `recommendation_references`
  ADD CONSTRAINT `fk_rec_references_recommendation_id` FOREIGN KEY (`recommendation_id`) REFERENCES `quiz_recommendations` (`recommendation_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Communication, Role Broadcasts, Audit & Dean Security Resolution Constraints
ALTER TABLE `announcements`
  ADD CONSTRAINT `fk_announcements_author_user_id` FOREIGN KEY (`author_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_announcements_target_role_id` FOREIGN KEY (`target_role_id`) REFERENCES `roles` (`role_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notifications_recipient_user_id` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_notifications_recipient_role_id` FOREIGN KEY (`recipient_role_id`) REFERENCES `roles` (`role_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_notifications_quiz_id` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`quiz_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_notifications_announcement_id` FOREIGN KEY (`announcement_id`) REFERENCES `announcements` (`announcement_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `activity_logs`
  ADD CONSTRAINT `fk_activity_logs_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `security_logs`
  ADD CONSTRAINT `fk_security_logs_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_security_logs_quiz_id` FOREIGN KEY (`quiz_id`) REFERENCES `quizzes` (`quiz_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_security_logs_attempt_id` FOREIGN KEY (`attempt_id`) REFERENCES `quiz_attempts` (`attempt_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_security_logs_resolved_by_dean_id` FOREIGN KEY (`resolved_by_dean_id`) REFERENCES `deans` (`dean_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. Authentication & Session Infrastructure Constraints
ALTER TABLE `personal_access_tokens`
  ADD CONSTRAINT `fk_personal_access_tokens_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `sessions`
  ADD CONSTRAINT `fk_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `fk_password_reset_tokens_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;
