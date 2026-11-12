<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SystemSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SystemSettingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $department = $this->scopedDepartment($request);

        $query = SystemSetting::query();
        if ($department !== null) {
            $query->where(function ($q) use ($department): void {
                $q->where('department', $department)->orWhereNull('department');
            });
        }

        return response()->json([
            'status' => 'success',
            'data' => $query->get(),
        ]);
    }

    public function update(Request $request, string $setting): JsonResponse
    {
        $departmentKeys = array_keys(config('lms.departments', ['CIT' => 'CIT']));

        $validated = $request->validate([
            'value' => ['nullable'],
            'type' => ['sometimes', Rule::in(['string', 'boolean', 'json'])],
            'description' => ['nullable', 'string', 'max:500'],
            'department' => ['nullable', 'string', Rule::in($departmentKeys)],
        ]);

        $user = $request->user();
        $targetDept = $user->isInstitutionWide()
            ? (isset($validated['department']) ? strtoupper(trim($validated['department'])) : null)
            : $this->resolveTargetDepartment($request);

        $record = is_numeric($setting)
            ? SystemSetting::find((int) $setting)
            : SystemSetting::where('department', $targetDept)->where('key', $setting)->first();

        if ($record !== null && ! $user->isInstitutionWide()) {
            $this->ensureSameDepartment($request, $record->department);
        }

        $val = $validated['value'] ?? '';
        if (is_bool($val)) {
            $val = $val ? 'true' : 'false';
        }

        if ($record === null) {
            $record = SystemSetting::create([
                'department' => $targetDept,
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
            'data' => $record,
        ]);
    }
}
