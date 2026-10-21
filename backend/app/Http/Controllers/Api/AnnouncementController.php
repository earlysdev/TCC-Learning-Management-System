<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use Illuminate\Http\Request;

class AnnouncementController extends Controller
{
    public function index(Request $request)
    {
        $query = Announcement::with('author:id,name');

        if ($request->user()->role === 'student') {
            $query->where(function($q) {
                $q->whereNull('target_role')
                  ->orWhere('target_role', 'student');
            });
        } elseif ($request->user()->role === 'teacher') {
            $query->where(function($q) {
                $q->whereNull('target_role')
                  ->orWhere('target_role', 'teacher');
            });
        }

        $announcements = $query->orderBy('is_pinned', 'desc')
                               ->latest()
                               ->paginate(15);

        return response()->json([
            'status' => 'success',
            'data' => $announcements
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'content' => 'required|string',
            'target_role' => 'nullable|in:student,teacher,secretary,principal,dean',
            'is_pinned' => 'boolean'
        ]);

        $announcement = $request->user()->announcements()->create($validated);

        return response()->json([
            'status' => 'success',
            'message' => 'Announcement created successfully',
            'data' => $announcement
        ], 201);
    }

    public function update(Request $request, Announcement $announcement)
    {
        if ($request->user()->id !== $announcement->user_id && !in_array($request->user()->role, ['principal', 'dean', 'secretary'])) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        $validated = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'content' => 'sometimes|required|string',
            'target_role' => 'nullable|in:student,teacher,secretary,principal,dean',
            'is_pinned' => 'boolean'
        ]);

        $announcement->update($validated);

        return response()->json([
            'status' => 'success',
            'message' => 'Announcement updated successfully',
            'data' => $announcement
        ]);
    }

    public function destroy(Request $request, Announcement $announcement)
    {
        if ($request->user()->id !== $announcement->user_id && !in_array($request->user()->role, ['principal', 'dean', 'secretary'])) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        $announcement->delete();

        return response()->json([
            'status' => 'success',
            'message' => 'Announcement deleted successfully'
        ]);
    }
}
