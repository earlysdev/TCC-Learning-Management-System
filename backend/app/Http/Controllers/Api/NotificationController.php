<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LmsNotification;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $notifications = $this->personalQuery($request->user())
            ->latest()
            ->paginate(20);

        return response()->json([
            'status' => 'success',
            'data' => $notifications,
        ]);
    }

    public function markRead(Request $request, LmsNotification $notification): JsonResponse
    {
        $user = $request->user();

        if ($notification->user_id === null || (int) $notification->user_id !== (int) $user->id) {
            return response()->json([
                'status' => 'error',
                'message' => 'Unauthorized',
            ], 403);
        }

        if (! $notification->is_read) {
            $notification->update([
                'is_read' => true,
                'read_at' => now(),
            ]);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Notification marked as read',
        ]);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        $this->personalQuery($request->user())
            ->where('is_read', false)
            ->update([
                'is_read' => true,
                'read_at' => now(),
            ]);

        return response()->json([
            'status' => 'success',
            'message' => 'All notifications marked as read',
        ]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $count = $this->personalQuery($request->user())
            ->where('is_read', false)
            ->count();

        return response()->json([
            'status' => 'success',
            'data' => ['unread_count' => $count],
        ]);
    }

    private function personalQuery(User $user): Builder
    {
        return LmsNotification::query()->where('user_id', $user->id);
    }
}
