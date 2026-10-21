<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Quiz;
use App\Models\QuizAttempt;
use App\Models\SecurityLog;
use Illuminate\Http\Request;

class AnalyticsController extends Controller
{
    public function secretaryDashboard()
    {
        $totalStudents = User::students()->count();
        $totalTeachers = User::teachers()->count();
        $recentRegistrations = User::latest()->take(10)->get();

        return response()->json([
            'status' => 'success',
            'data' => [
                'total_students' => $totalStudents,
                'total_teachers' => $totalTeachers,
                'recent_registrations' => $recentRegistrations
            ]
        ]);
    }

    public function principalDashboard()
    {
        $activeUsers = User::active()->count();
        $totalQuizzes = Quiz::count();
        $totalAttempts = QuizAttempt::count();
        $securityAlerts = SecurityLog::where('is_resolved', false)->count();

        $averageScore = QuizAttempt::avg('percentage');

        return response()->json([
            'status' => 'success',
            'data' => [
                'active_users' => $activeUsers,
                'total_quizzes' => $totalQuizzes,
                'total_attempts' => $totalAttempts,
                'average_score_percentage' => round($averageScore, 2),
                'unresolved_security_alerts' => $securityAlerts
            ]
        ]);
    }

    public function studentPerformance(User $student)
    {
        if ($student->role !== 'student') {
            return response()->json([
                'status' => 'error',
                'message' => 'User is not a student'
            ], 400);
        }

        $attempts = $student->quizAttempts()->with('quiz:id,title,subject')->get();
        
        $averagePercentage = $attempts->avg('percentage');
        $totalQuizzesTaken = $attempts->count();

        return response()->json([
            'status' => 'success',
            'data' => [
                'student' => $student->only(['id', 'name', 'grade', 'section']),
                'total_quizzes_taken' => $totalQuizzesTaken,
                'average_percentage' => round($averagePercentage, 2),
                'attempts' => $attempts
            ]
        ]);
    }
}
