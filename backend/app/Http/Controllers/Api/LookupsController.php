<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DepartmentResource;
use App\Http\Resources\PersonResource;
use App\Http\Resources\PhaseResource;
use App\Models\Department;
use App\Models\MasterPlanPhase;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class LookupsController extends Controller
{
    public function __invoke(): JsonResponse
    {
        // people: { id, fullName }[] – sắp theo tên để UI dễ chọn
        $people = User::where('is_active', true)->orderBy('full_name')->get(['id', 'full_name']);
        $departments = Department::orderBy('name')->get(['id', 'code', 'name']);
        $phases = MasterPlanPhase::orderBy('sort_order')->get();

        return response()->json([
            'people' => PersonResource::collection($people),
            'departments' => DepartmentResource::collection($departments),
            'phases' => PhaseResource::collection($phases),
        ]);
    }
}
