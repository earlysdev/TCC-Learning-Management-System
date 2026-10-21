<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $query = User::query();

        if ($request->has('role')) {
            $query->byRole($request->role);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('grade')) {
            $query->where('grade', $request->grade);
        }

        if ($request->has('section')) {
            $query->where('section', $request->section);
        }

        if ($request->has('search')) {
            $search = $request->search;
            $query->where(function($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('first_name', 'like', "%{$search}%")
                  ->orWhere('last_name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('lrn', 'like', "%{$search}%");
            });
        }

        $users = $query->paginate(15);

        return response()->json([
            'status' => 'success',
            'data' => $users
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'first_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8',
            'role' => 'required|in:student,teacher,secretary,principal,dean',
            'lrn' => 'nullable|string|unique:users',
            'grade' => 'nullable|string|max:16',
            'section' => 'nullable|string|max:64',
            'school_year' => 'nullable|string|max:9',
        ]);

        if (!empty($validated['section']) && preg_match('/Block\s*-\s*([1-4])[A-E]/i', $validated['section'], $matches)) {
            $yearMap = ['1' => '1st Year', '2' => '2nd Year', '3' => '3rd Year', '4' => '4th Year'];
            $validated['grade'] = $yearMap[$matches[1]] ?? ($validated['grade'] ?? null);
        }

        $validated['password'] = Hash::make($validated['password']);
        $validated['status'] = $validated['status'] ?? 'active';

        $user = User::create($validated);

        \App\Models\ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'create_user',
            'description' => "Created {$user->role} account for {$user->name}" . ($user->section ? " ({$user->section})" : ''),
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'User created successfully',
            'data' => $user
        ], 201);
    }

    public function show(User $user)
    {
        $user->loadCount(['quizzes', 'quizAttempts']);

        return response()->json([
            'status' => 'success',
            'data' => $user
        ]);
    }

    public function update(Request $request, User $user)
    {
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'first_name' => 'nullable|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'sometimes|required|string|email|max:255|unique:users,email,' . $user->id,
            'password' => 'nullable|string|min:8',
            'grade' => 'nullable|string|max:16',
            'section' => 'nullable|string|max:64',
        ]);

        if (!empty($validated['section']) && preg_match('/Block\s*-\s*([1-4])[A-E]/i', $validated['section'], $matches)) {
            $yearMap = ['1' => '1st Year', '2' => '2nd Year', '3' => '3rd Year', '4' => '4th Year'];
            $validated['grade'] = $yearMap[$matches[1]] ?? ($validated['grade'] ?? null);
        }

        if (isset($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            unset($validated['password']);
        }

        $user->update($validated);

        return response()->json([
            'status' => 'success',
            'message' => 'User updated successfully',
            'data' => $user
        ]);
    }

    public function toggleStatus(User $user, Request $request)
    {
        $validated = $request->validate([
            'status' => 'required|in:active,inactive,graduated'
        ]);

        $user->update(['status' => $validated['status']]);

        \App\Models\ActivityLog::create([
            'user_id' => $request->user()?->id,
            'action' => 'update_user_status',
            'description' => "Changed {$user->name}'s status to {$validated['status']}",
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'User status updated successfully',
            'data' => $user
        ]);
    }

    public function teacherStudents(Request $request)
    {
        $students = User::where('role', 'student')
            ->orderBy('grade')
            ->orderBy('section')
            ->orderBy('name')
            ->get();

        return response()->json([
            'status' => 'success',
            'data' => $students
        ]);
    }
}
