<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DepartmentResource;
use App\Http\Resources\PersonResource;
use App\Http\Resources\PhaseResource;
use App\Models\Department;
use App\Models\DocumentStatusItem;
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
        // Trạng thái tài liệu đang bật (kèm label/màu do admin quản lý) – UI lọc/hiển thị.
        $documentStatuses = DocumentStatusItem::where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(fn (DocumentStatusItem $s) => [
                'id' => $s->id,
                'code' => $s->code,
                'label' => $s->label,
                'color' => $s->color,
                'sortOrder' => (int) $s->sort_order,
                'isActive' => (bool) $s->is_active,
                'isSystem' => (bool) $s->is_system,
            ]);

        return response()->json([
            'people' => PersonResource::collection($people),
            'departments' => DepartmentResource::collection($departments),
            'phases' => PhaseResource::collection($phases),
            'documentStatuses' => $documentStatuses,
        ]);
    }
}
