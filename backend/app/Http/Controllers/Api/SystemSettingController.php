<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemSetting;
use Illuminate\Http\Request;

class SystemSettingController extends Controller
{
    public function index()
    {
        $settings = SystemSetting::all();

        return response()->json([
            'status' => 'success',
            'data' => $settings
        ]);
    }

    public function update(Request $request, string $setting)
    {
        $validated = $request->validate([
            'value' => 'nullable',
            'type' => 'sometimes|in:string,boolean,json',
            'description' => 'nullable|string'
        ]);

        $record = is_numeric($setting)
            ? SystemSetting::find($setting)
            : SystemSetting::where('key', $setting)->first();

        $val = $validated['value'] ?? '';
        if (is_bool($val)) {
            $val = $val ? 'true' : 'false';
        }

        if (!$record) {
            $record = SystemSetting::create([
                'key' => $setting,
                'value' => (string) $val,
                'type' => $validated['type'] ?? 'string',
                'description' => $validated['description'] ?? null,
            ]);
        } else {
            $record->update([
                'value' => (string) $val,
                'type' => $validated['type'] ?? $record->type,
                'description' => $validated['description'] ?? $record->description,
            ]);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'System setting updated successfully',
            'data' => $record
        ]);
    }
}

