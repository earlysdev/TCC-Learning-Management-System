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
    public function secretaryDashboard(Request $request)
    {
        $department = $this->scopedDepartment($request);

        $studentsQuery = User::students();
        $teachersQuery = User::teachers();
        $recentQuery = User::latest()->take(10);

        if ($department !== null) {
            $studentsQuery->where('department', $department);
            $teachersQuery->where('department', $department);
            $recentQuery->where('department', $department);
        }

        return response()->json([
            'status' => 'success',
            'data' => [
                'total_students' => $studentsQuery->count(),
                'total_teachers' => $teachersQuery->count(),
                'recent_registrations' => $recentQuery->get(),
            ]
        ]);
    }

    public function principalDashboard(Request $request)
    {
        $department = $this->scopedDepartment($request);

        $activeUsersQuery = User::active();
        $studentsQuery = User::students();
        $quizzesQuery = Quiz::query();
        $publishedQuizzesQuery = Quiz::where('is_published', true);
        $attemptsQuery = QuizAttempt::query();
        $securityAlertsQuery = SecurityLog::where('is_resolved', false);

        if ($department !== null) {
            $activeUsersQuery->where('department', $department);
            $studentsQuery->where('department', $department);
            $quizzesQuery->where('department', $department);
            $publishedQuizzesQuery->where('department', $department);
            $attemptsQuery->whereHas('quiz', fn ($q) => $q->where('department', $department));
            $securityAlertsQuery->where(function ($q) use ($department) {
                $q->whereHas('user', fn ($uq) => $uq->where('department', $department))
                    ->orWhere('details->department', $department);
            });
        }

        $activeUsers = $activeUsersQuery->count();
        $totalStudents = max(1, $studentsQuery->count());
        $totalQuizzes = $quizzesQuery->count();
        $publishedQuizzes = $publishedQuizzesQuery->count();
        $totalAttempts = (clone $attemptsQuery)->count();
        $securityAlerts = $securityAlertsQuery->count();

        $averageScore = (float) ($attemptsQuery->avg('percentage') ?? 0);
        $expectedAttempts = max(1, $publishedQuizzes * $totalStudents);
        $quizCompletion = $publishedQuizzes > 0
            ? min(100, round(($totalAttempts / $expectedAttempts) * 100, 1))
            : 0;

        return response()->json([
            'status' => 'success',
            'data' => [
                'active_users' => $activeUsers,
                'total_quizzes' => $totalQuizzes,
                'total_attempts' => $totalAttempts,
                'quiz_completion' => $quizCompletion,
                'average_score_percentage' => round($averageScore, 2),
                'unresolved_security_alerts' => $securityAlerts
            ]
        ]);
    }

    public function studentPerformance(Request $request, User $student)
    {
        $this->ensureSameDepartment($request, $student->departmentCode());

        if ($student->role !== 'student') {
            return response()->json([
                'status' => 'error',
                'message' => 'User is not a student'
            ], 400);
        }

        $attempts = $student->quizAttempts()->with('quiz:id,title,subject')->get();
        
        $averagePercentage = (float) ($attempts->avg('percentage') ?? 0);
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
