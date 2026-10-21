<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LmsNotification;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request)
    {
        $notifications = LmsNotification::where('user_id', $request->user()->id)
            ->orWhere('recipient_role', $request->user()->role)
            ->latest()
            ->paginate(20);

        return response()->json([
            'status' => 'success',
            'data' => $notifications
        ]);
    }

    public function markRead(Request $request, LmsNotification $notification)
    {
        if ($notification->user_id && $notification->user_id !== $request->user()->id) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized'
            ], 403);
        }

        $notification->update([
            'is_read' => true,
            'read_at' => now()
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Notification marked as read'
        ]);
    }

    public function markAllRead(Request $request)
    {
        LmsNotification::where('user_id', $request->user()->id)
            ->where('is_read', false)
            ->update([
                'is_read' => true,
                'read_at' => now()
            ]);

        return response()->json([
            'status' => 'success',
            'message' => 'All notifications marked as read'
        ]);
    }

    public function unreadCount(Request $request)
    {
        $count = LmsNotification::where(function($q) use ($request) {
                $q->where('user_id', $request->user()->id)
                  ->orWhere('recipient_role', $request->user()->role);
            })
            ->where('is_read', false)
            ->count();

        return response()->json([
            'status' => 'success',
            'data' => ['unread_count' => $count]
        ]);
    }
}
