<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SecurityLog;
use Illuminate\Http\Request;

class SecurityLogController extends Controller
{
    public function index(Request $request)
    {
        $query = SecurityLog::with('user:id,name,role');

        if ($request->has('event_type')) {
            $query->where('event_type', $request->event_type);
        }

        if ($request->has('is_resolved')) {
            $query->where('is_resolved', $request->is_resolved === 'true');
        }

        $logs = $query->latest()->paginate(20);

        return response()->json([
            'status' => 'success',
            'data' => $logs
        ]);
    }

    public function resolve(SecurityLog $log)
    {
        $log->update([
            'is_resolved' => true,
            'resolved_at' => now()
        ]);

        return response()->json([
            'status' => 'success',
            'message' => 'Security log marked as resolved',
            'data' => $log
        ]);
    }
}
