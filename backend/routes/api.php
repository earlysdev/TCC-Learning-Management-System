<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\QuizController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\AnnouncementController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\SecurityLogController;
use App\Http\Controllers\Api\SystemSettingController;
use App\Http\Controllers\Api\SectionController;
use App\Http\Controllers\Api\SubjectController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json(['status' => 'ok', 'app' => 'LNHS LMS API']));

Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:6,1');
Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:6,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Academic Sections & Structuring
    Route::get('/sections', [SectionController::class, 'index']);
    Route::middleware('role:secretary,principal,dean')->group(function () {
        Route::post('/sections', [SectionController::class, 'store']);
        Route::delete('/sections/{section}', [SectionController::class, 'destroy']);
    });

    // Teacher Quiz Routes
    Route::get('/teacher/dashboard', [QuizController::class, 'teacherDashboard']);
    Route::get('/teacher/students', [UserController::class, 'teacherStudents']);
    Route::post('/teacher/quizzes/generate', [QuizController::class, 'generate'])->middleware('throttle:5,1');
    Route::put('/teacher/quizzes/{quiz}', [QuizController::class, 'update']);
    Route::patch('/teacher/quizzes/{quiz}', [QuizController::class, 'update']);
    Route::patch('/teacher/quizzes/{quiz}/publish', [QuizController::class, 'publish']);
    Route::get('/teacher/quizzes/{quiz}/submissions', [QuizController::class, 'submissions']);

    // Curriculum Subjects
    Route::get('/subjects', [SubjectController::class, 'index']);
    Route::middleware('role:secretary,principal,dean')->group(function () {
        Route::post('/subjects', [SubjectController::class, 'store']);
        Route::delete('/subjects/{subject}', [SubjectController::class, 'destroy']);
    });

    // Student Quiz Routes
    Route::get('/student/quizzes', [QuizController::class, 'studentQuizzes']);
    Route::get('/student/quizzes/{quiz}', [QuizController::class, 'showForStudent']);
    Route::post('/student/quizzes/{quiz}/violation', [QuizController::class, 'logViolation'])->middleware('throttle:60,1');
    Route::post('/student/quizzes/{quiz}/integrity-events', [QuizController::class, 'logViolation'])->middleware('throttle:60,1');
    Route::post('/student/quizzes/{quiz}/submit', [QuizController::class, 'submit'])->middleware('throttle:20,1');

    // Users Management
    Route::get('/users', [UserController::class, 'index'])->middleware('role:teacher,secretary,principal,dean');
    Route::middleware('role:secretary,principal,dean')->group(function () {
        Route::post('/users', [UserController::class, 'store']);
        Route::get('/users/{user}', [UserController::class, 'show']);
        Route::put('/users/{user}', [UserController::class, 'update']);
        Route::patch('/users/{user}/status', [UserController::class, 'toggleStatus']);
    });

    // Announcements
    Route::get('/announcements', [AnnouncementController::class, 'index']);
    Route::middleware('role:teacher,principal,dean,secretary')->group(function () {
        Route::post('/announcements', [AnnouncementController::class, 'store']);
        Route::put('/announcements/{announcement}', [AnnouncementController::class, 'update']);
        Route::delete('/announcements/{announcement}', [AnnouncementController::class, 'destroy']);
    });

    // Notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::patch('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    Route::post('/notifications/mark-all-read', [NotificationController::class, 'markAllRead']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);

    // Analytics & Role Dashboards
    Route::middleware('role:secretary,principal,dean')->group(function () {
        Route::get('/analytics/secretary', [AnalyticsController::class, 'secretaryDashboard']);
        Route::get('/secretary/dashboard', [AnalyticsController::class, 'secretaryDashboard']);
        Route::get('/analytics/principal', [AnalyticsController::class, 'principalDashboard']);
        Route::get('/principal/dashboard', [AnalyticsController::class, 'principalDashboard']);
        Route::get('/analytics/dean', [AnalyticsController::class, 'principalDashboard']);
        Route::get('/dean/dashboard', [AnalyticsController::class, 'principalDashboard']);
        Route::get('/analytics/students/{student}', [AnalyticsController::class, 'studentPerformance']);
    });

    // Logs
    Route::middleware('role:secretary,principal,dean')->group(function () {
        Route::get('/activity-logs', [ActivityLogController::class, 'index']);
    });

    Route::middleware('role:principal,dean')->group(function () {
        Route::get('/security-logs', [SecurityLogController::class, 'index']);
        Route::get('/principal/security-logs', [SecurityLogController::class, 'index']);
        Route::get('/dean/security-logs', [SecurityLogController::class, 'index']);
        Route::patch('/security-logs/{log}/resolve', [SecurityLogController::class, 'resolve']);
    });

    // System Settings
    Route::middleware('role:principal,dean')->group(function () {
        Route::get('/settings', [SystemSettingController::class, 'index']);
        Route::put('/settings/{setting}', [SystemSettingController::class, 'update']);
        Route::get('/system-settings', [SystemSettingController::class, 'index']);
        Route::put('/system-settings/{setting}', [SystemSettingController::class, 'update']);
    });
});
