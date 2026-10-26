<?php

namespace App\Http\Controllers\Api;

use App\Enums\LogEntity;
use App\Http\Controllers\Controller;
use App\Http\Resources\PhaseResource;
use App\Http\Resources\RoleResource;
use App\Http\Resources\UserResource;
use App\Models\Action;
use App\Models\ActivityLog;
use App\Models\Department;
use App\Models\Document;
use App\Models\DocumentStatusItem;
use App\Models\MasterPlanPhase;
use App\Models\MasterPlanTask;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminController extends Controller
{
    /** 9 vai trò chuẩn ISO – không cho xóa để giữ toàn vẹn ma trận RBAC. */
    private const STANDARD_ROLES = [
        'super_admin', 'iso_leader', 'iso_deputy', 'iso_member', 'iso_coordinator',
        'dept_manager', 'document_owner', 'auditor', 'normal_user',
    ];

    /** GET /admin/users – danh sách UserItem (camelCase, KHÔNG lộ password). */
    public function users(): JsonResponse
    {
        $users = User::with('department', 'roles')
            ->orderBy('id')
            ->get();

        // Trả MẢNG trực tiếp (không bọc { data }) để khớp contract mock FE.
        return response()->json(UserResource::collection($users));
    }

    /** GET /admin/roles – danh sách RoleItem (camelCase, kèm permissions[]). */
    public function roles(): JsonResponse
    {
        $roles = Role::with('permissions')
            ->orderBy('id')
            ->get();

        // Trả MẢNG trực tiếp (không bọc { data }) để khớp contract mock FE.
        return response()->json(RoleResource::collection($roles));
    }

    /**
     * POST /admin/users – tạo người dùng (quyền user.create).
     * Password hash qua cast 'hashed' của model User.
     */
    public function storeUser(Request $request): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $data = $request->validate([
            'username' => ['required', 'string', 'max:50', 'regex:/^[a-zA-Z0-9._-]+$/', Rule::unique('users', 'username')],
            'password' => ['required', 'string', 'min:6', 'max:100'],
            'fullName' => ['required', 'string', 'max:150'],
            'email' => ['nullable', 'email', 'max:150', Rule::unique('users', 'email')],
            'departmentId' => ['nullable', 'integer', 'exists:departments,id'],
            'roleCodes' => ['array'],
            'roleCodes.*' => ['string', Rule::exists('roles', 'code')],
            'active' => ['sometimes', 'boolean'],
        ]);

        $user = DB::transaction(function () use ($data, $actor) {
            $user = User::create([
                'username' => $data['username'],
                'full_name' => $data['fullName'],
                'email' => $data['email'] ?? null,
                'password' => $data['password'],
                'department_id' => $data['departmentId'] ?? null,
                'is_active' => $data['active'] ?? true,
            ]);
            $user->roles()->sync(Role::whereIn('code', $data['roleCodes'] ?? [])->pluck('id'));

            ActivityLog::create([
                'user_id' => $actor?->id, 'action' => 'create',
                'entity' => LogEntity::User->value, 'entity_id' => $user->id,
            ]);

            return $user;
        });

        return response()->json(new UserResource($user->fresh(['department', 'roles'])), 201);
    }

    /** PATCH /admin/users/{id} – sửa người dùng (quyền user.update). */
    public function updateUser(Request $request, int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $user = User::findOrFail($id);

        $data = $request->validate([
            'username' => ['sometimes', 'string', 'max:50', 'regex:/^[a-zA-Z0-9._-]+$/', Rule::unique('users', 'username')->ignore($user->id)],
            'password' => ['nullable', 'string', 'min:6', 'max:100'],
            'fullName' => ['sometimes', 'string', 'max:150'],
            'email' => ['nullable', 'email', 'max:150', Rule::unique('users', 'email')->ignore($user->id)],
            'departmentId' => ['nullable', 'integer', 'exists:departments,id'],
            'roleCodes' => ['array'],
            'roleCodes.*' => ['string', Rule::exists('roles', 'code')],
            'active' => ['sometimes', 'boolean'],
        ]);

        // Không cho phép tự vô hiệu hóa chính mình (mất quyền truy cập quản trị).
        if ($actor && $actor->id === $user->id && array_key_exists('active', $data) && ! $data['active']) {
            return $this->error('Không thể tự vô hiệu hóa tài khoản của chính mình.', 409);
        }

        DB::transaction(function () use ($user, $data) {
            if (array_key_exists('username', $data)) {
                $user->username = $data['username'];
            }
            if (! empty($data['password'])) {
                $user->password = $data['password'];
            }
            if (array_key_exists('fullName', $data)) {
                $user->full_name = $data['fullName'];
            }
            if (array_key_exists('email', $data)) {
                $user->email = $data['email'];
            }
            if (array_key_exists('departmentId', $data)) {
                $user->department_id = $data['departmentId'];
            }
            if (array_key_exists('active', $data)) {
                $user->is_active = $data['active'];
            }
            $user->save();

            if (array_key_exists('roleCodes', $data)) {
                $user->roles()->sync(Role::whereIn('code', $data['roleCodes'])->pluck('id'));
            }
        });

        return response()->json(new UserResource($user->fresh(['department', 'roles'])));
    }

    /** DELETE /admin/users/{id} – xóa (soft delete) người dùng. Quyền user.update. */
    public function destroyUser(int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $user = User::findOrFail($id);

        if ($actor && $actor->id === $user->id) {
            return $this->error('Không thể xóa tài khoản của chính mình.', 409);
        }

        DB::transaction(function () use ($user) {
            $user->tokens()->delete(); // thu hồi mọi Bearer token đang hoạt động
            $user->roles()->detach();
            $user->delete(); // soft delete (migration có softDeletes)
        });

        return response()->json(['status' => 'ok']);
    }

    /**
     * POST /admin/roles – tạo vai trò mới + gán permissions (quyền role.manage).
     * Cho phép tạo role tùy chỉnh; 9 vai trò chuẩn chỉ được sửa phân quyền.
     */
    public function storeRole(Request $request): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'regex:/^[a-z][a-z0-9_]*$/', Rule::unique('roles', 'code')],
            'name' => ['required', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'permissions' => ['array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'code')],
        ]);

        $role = DB::transaction(function () use ($data, $actor) {
            $role = Role::create([
                'code' => $data['code'],
                'name' => $data['name'],
                'description' => $data['description'] ?? null,
            ]);
            $role->permissions()->sync(Permission::whereIn('code', $data['permissions'] ?? [])->pluck('id'));

            ActivityLog::create([
                'user_id' => $actor?->id, 'action' => 'create',
                'entity' => LogEntity::Role->value, 'entity_id' => $role->id,
            ]);

            return $role;
        });

        return response()->json(new RoleResource($role->fresh('permissions')), 201);
    }

    /** PATCH /admin/roles/{id} – sửa tên + phân quyền (quyền role.manage). */
    public function updateRole(Request $request, int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $role = Role::findOrFail($id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:100'],
            'description' => ['nullable', 'string'],
            'permissions' => ['array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'code')],
        ]);

        DB::transaction(function () use ($role, $data) {
            if (array_key_exists('name', $data)) {
                $role->name = $data['name'];
            }
            if (array_key_exists('description', $data)) {
                $role->description = $data['description'];
            }
            $role->save();

            if (array_key_exists('permissions', $data)) {
                $role->permissions()->sync(Permission::whereIn('code', $data['permissions'])->pluck('id'));
            }
        });

        ActivityLog::create([
            'user_id' => $actor?->id, 'action' => 'update',
            'entity' => LogEntity::Role->value, 'entity_id' => $role->id,
        ]);

        return response()->json(new RoleResource($role->fresh('permissions')));
    }

    /** DELETE /admin/roles/{id} – xóa vai trò tùy chỉnh. Chặn vai trò chuẩn + vai trò đang gán user. */
    public function destroyRole(int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $role = Role::withCount('users')->findOrFail($id);

        if (in_array($role->code, self::STANDARD_ROLES, true)) {
            return $this->error('Không thể xóa vai trò chuẩn của hệ thống. Chỉ được sửa phân quyền.', 409);
        }
        if ((int) $role->users_count > 0) {
            return $this->error('Vai trò đang được gán cho người dùng. Hãy gán lại người dùng trước khi xóa.', 409);
        }

        $role->delete(); // role_permissions cascadeOnDelete

        ActivityLog::create([
            'user_id' => $actor?->id, 'action' => 'delete',
            'entity' => LogEntity::Role->value, 'entity_id' => $role->id,
        ]);

        return response()->json(['status' => 'ok']);
    }

    // ===================== CRUD NHÓM CÔNG VIỆC (GIAI ĐOẠN / PHASE) =====================

    /**
     * GET /admin/phases – danh sách nhóm công việc (Giai đoạn) kèm số công việc.
     * Thuộc kế hoạch nào (masterPlanId) để admin chọn khi tạo/sửa.
     */
    public function phases(): JsonResponse
    {
        $phases = MasterPlanPhase::withCount('tasks')
            ->orderBy('master_plan_id')
            ->orderBy('sort_order')
            ->get();

        return response()->json($phases->map(fn (MasterPlanPhase $p) => [
            'id' => $p->id,
            'masterPlanId' => $p->master_plan_id,
            'code' => $p->code,
            'name' => $p->name,
            'startDate' => $p->start_date?->format('Y-m-d'),
            'endDate' => $p->end_date?->format('Y-m-d'),
            'sortOrder' => (int) $p->sort_order,
            'taskCount' => (int) $p->tasks_count,
        ]));
    }

    /** POST /admin/phases – tạo nhóm công việc (quyền master_plan.create). */
    public function storePhase(Request $request): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $data = $request->validate([
            'masterPlanId' => ['required', 'integer', 'exists:master_plans,id'],
            'code' => ['required', 'string', 'max:20'],
            'name' => ['required', 'string', 'max:200'],
            'startDate' => ['required', 'date'],
            'endDate' => ['required', 'date', 'after_or_equal:startDate'],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
        ]);

        $dup = MasterPlanPhase::where('master_plan_id', $data['masterPlanId'])
            ->where('code', $data['code'])
            ->exists();
        if ($dup) {
            return $this->error("Mã nhóm \"{$data['code']}\" đã tồn tại trong kế hoạch này.", 409);
        }

        $phase = MasterPlanPhase::create([
            'master_plan_id' => $data['masterPlanId'],
            'code' => $data['code'],
            'name' => $data['name'],
            'start_date' => $data['startDate'],
            'end_date' => $data['endDate'],
            'sort_order' => $data['sortOrder']
                ?? ((int) MasterPlanPhase::where('master_plan_id', $data['masterPlanId'])->max('sort_order')) + 1,
        ]);

        $this->logAdmin($actor, 'create', 'master_plan_phase', $phase->id);

        return response()->json((new PhaseResource($phase))->additional(['taskCount' => 0]), 201);
    }

    /** PATCH /admin/phases/{id} – sửa nhóm công việc (quyền master_plan.update). */
    public function updatePhase(Request $request, int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $phase = MasterPlanPhase::find($id);
        if (! $phase) {
            return $this->error('Không tìm thấy nhóm công việc.', 404);
        }

        $data = $request->validate([
            'masterPlanId' => ['sometimes', 'integer', 'exists:master_plans,id'],
            'code' => ['sometimes', 'string', 'max:20'],
            'name' => ['sometimes', 'string', 'max:200'],
            'startDate' => ['sometimes', 'date'],
            'endDate' => ['sometimes', 'date', 'after_or_equal:startDate'],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
        ]);

        $planId = (int) ($data['masterPlanId'] ?? $phase->master_plan_id);
        if (array_key_exists('code', $data)) {
            $dup = MasterPlanPhase::where('master_plan_id', $planId)
                ->where('code', $data['code'])
                ->where('id', '!=', $phase->id)
                ->exists();
            if ($dup) {
                return $this->error("Mã nhóm \"{$data['code']}\" đã tồn tại trong kế hoạch này.", 409);
            }
        }

        $map = [
            'masterPlanId' => 'master_plan_id', 'code' => 'code', 'name' => 'name',
            'startDate' => 'start_date', 'endDate' => 'end_date', 'sortOrder' => 'sort_order',
        ];
        foreach ($map as $in => $col) {
            if (array_key_exists($in, $data)) {
                $phase->{$col} = $data[$in];
            }
        }
        $phase->save();

        $this->logAdmin($actor, 'update', 'master_plan_phase', $phase->id);

        return response()->json(new PhaseResource($phase));
    }

    /** DELETE /admin/phases/{id} – xóa nhóm công việc. Chặn khi còn công việc trực thuộc (409). */
    public function destroyPhase(int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $phase = MasterPlanPhase::withCount('tasks')->find($id);
        if (! $phase) {
            return $this->error('Không tìm thấy nhóm công việc.', 404);
        }
        if ((int) $phase->tasks_count > 0) {
            return $this->error('Nhóm còn công việc trực thuộc. Hãy chuyển hoặc xóa công việc trước khi xóa nhóm.', 409);
        }

        $phase->delete();
        $this->logAdmin($actor, 'delete', 'master_plan_phase', $id);

        return response()->json(['status' => 'ok']);
    }

    // ===================== CRUD PHÒNG BAN =====================

    /** GET /admin/departments – danh sách phòng ban (kèm mô tả/active/số người dùng). */
    public function departments(): JsonResponse
    {
        $departments = Department::withCount('users')->orderBy('code')->get();

        return response()->json($departments->map(fn (Department $d) => [
            'id' => $d->id,
            'code' => $d->code,
            'name' => $d->name,
            'description' => $d->description,
            'isActive' => (bool) $d->is_active,
            'userCount' => (int) $d->users_count,
        ]));
    }

    /** POST /admin/departments – tạo phòng ban (quyền department.manage). */
    public function storeDepartment(Request $request): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $data = $request->validate([
            'code' => ['required', 'string', 'max:20', Rule::unique('departments', 'code')],
            'name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        $department = Department::create([
            'code' => $data['code'],
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'is_active' => $data['isActive'] ?? true,
        ]);

        $this->logAdmin($actor, 'create', 'department', $department->id);

        return response()->json([
            'id' => $department->id,
            'code' => $department->code,
            'name' => $department->name,
            'description' => $department->description,
            'isActive' => (bool) $department->is_active,
        ], 201);
    }

    /** PATCH /admin/departments/{id} – sửa phòng ban (quyền department.manage). */
    public function updateDepartment(Request $request, int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $department = Department::find($id);
        if (! $department) {
            return $this->error('Không tìm thấy phòng ban.', 404);
        }

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:20', Rule::unique('departments', 'code')->ignore($department->id)],
            'name' => ['sometimes', 'string', 'max:150'],
            'description' => ['nullable', 'string'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        $map = ['code' => 'code', 'name' => 'name', 'description' => 'description', 'isActive' => 'is_active'];
        foreach ($map as $in => $col) {
            if (array_key_exists($in, $data)) {
                $department->{$col} = $data[$in];
            }
        }
        $department->save();

        $this->logAdmin($actor, 'update', 'department', $department->id);

        return response()->json([
            'id' => $department->id,
            'code' => $department->code,
            'name' => $department->name,
            'description' => $department->description,
            'isActive' => (bool) $department->is_active,
        ]);
    }

    /** DELETE /admin/departments/{id} – xóa phòng ban. Chặn khi còn user/tài liệu/công việc/action trực thuộc. */
    public function destroyDepartment(int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $department = Department::find($id);
        if (! $department) {
            return $this->error('Không tìm thấy phòng ban.', 404);
        }

        $refs = [
            'người dùng' => User::where('department_id', $department->id)->count(),
            'tài liệu' => Document::where('department_id', $department->id)->count(),
            'công việc' => MasterPlanTask::where('department_id', $department->id)->count(),
            'action' => Action::where('department_id', $department->id)->count(),
        ];
        foreach ($refs as $label => $count) {
            if ($count > 0) {
                return $this->error("Phòng ban đang được gán cho {$count} {$label}. Hãy gán lại trước khi xóa.", 409);
            }
        }

        $department->delete();
        $this->logAdmin($actor, 'delete', 'department', $id);

        return response()->json(['status' => 'ok']);
    }

    // ===================== CRUD TRẠNG THÁI TÀI LIỆU =====================

    /** GET /admin/document-statuses – dictionary trạng thái tài liệu (admin xem tất cả). */
    public function documentStatuses(): JsonResponse
    {
        return response()->json(DocumentStatusItem::orderBy('sort_order')->orderBy('id')->get()->map(fn (DocumentStatusItem $s) => [
            'id' => $s->id,
            'code' => $s->code,
            'label' => $s->label,
            'color' => $s->color,
            'sortOrder' => (int) $s->sort_order,
            'isActive' => (bool) $s->is_active,
            'isSystem' => (bool) $s->is_system,
            'usageCount' => Document::where('status', $s->code)->count(),
        ]));
    }

    /** POST /admin/document-statuses – tạo trạng thái tùy chỉnh (quyền document_status.manage). */
    public function storeDocumentStatus(Request $request): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $data = $request->validate([
            'code' => ['required', 'string', 'max:30', 'regex:/^[a-z][a-z0-9_]*$/', Rule::unique('document_statuses', 'code')],
            'label' => ['required', 'string', 'max:100'],
            'color' => ['nullable', 'string', 'max:20'],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        $status = DocumentStatusItem::create([
            'code' => $data['code'],
            'label' => $data['label'],
            'color' => $data['color'] ?? null,
            'sort_order' => $data['sortOrder'] ?? 100,
            'is_active' => $data['isActive'] ?? true,
            'is_system' => false,
        ]);

        $this->logAdmin($actor, 'create', 'document_status', $status->id);

        return response()->json([
            'id' => $status->id,
            'code' => $status->code,
            'label' => $status->label,
            'color' => $status->color,
            'sortOrder' => (int) $status->sort_order,
            'isActive' => (bool) $status->is_active,
            'isSystem' => (bool) $status->is_system,
            'usageCount' => Document::where('status', $status->code)->count(),
        ], 201);
    }

    /** PATCH /admin/document-statuses/{id} – sửa nhãn/màu/thứ tự/active (mã trạng thái hệ thống bị khóa). */
    public function updateDocumentStatus(Request $request, int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $status = DocumentStatusItem::find($id);
        if (! $status) {
            return $this->error('Không tìm thấy trạng thái tài liệu.', 404);
        }
        if ($status->is_system && array_key_exists('code', $request->all())) {
            return $this->error('Không thể đổi mã của trạng thái hệ thống.', 409);
        }

        $data = $request->validate([
            'label' => ['sometimes', 'string', 'max:100'],
            'color' => ['nullable', 'string', 'max:20'],
            'sortOrder' => ['sometimes', 'integer', 'min:0'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        $map = ['label' => 'label', 'color' => 'color', 'sortOrder' => 'sort_order', 'isActive' => 'is_active'];
        foreach ($map as $in => $col) {
            if (array_key_exists($in, $data)) {
                $status->{$col} = $data[$in];
            }
        }
        $status->save();

        $this->logAdmin($actor, 'update', 'document_status', $status->id);

        $status->refresh();

        return response()->json([
            'id' => $status->id,
            'code' => $status->code,
            'label' => $status->label,
            'color' => $status->color,
            'sortOrder' => (int) $status->sort_order,
            'isActive' => (bool) $status->is_active,
            'isSystem' => (bool) $status->is_system,
            'usageCount' => Document::where('status', $status->code)->count(),
        ]);
    }

    /** DELETE /admin/document-statuses/{id} – chỉ xóa trạng thái tùy chỉnh; chặn trạng thái chuẩn/đang dùng. */
    public function destroyDocumentStatus(int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        $status = DocumentStatusItem::find($id);
        if (! $status) {
            return $this->error('Không tìm thấy trạng thái tài liệu.', 404);
        }
        if ($status->is_system) {
            return $this->error('Không thể xóa trạng thái chuẩn của workflow. Chỉ được sửa nhãn/màu/thứ tự.', 409);
        }
        $used = Document::where('status', $status->code)->count();
        if ($used > 0) {
            return $this->error("Còn {$used} tài liệu đang ở trạng thái này. Hãy chuyển tài liệu trước khi xóa.", 409);
        }

        $status->delete();
        $this->logAdmin($actor, 'delete', 'document_status', $id);

        return response()->json(['status' => 'ok']);
    }

    /** Ghi activity log cho mọi thao tác CRUD dữ liệu quản trị. */
    private function logAdmin($actor, string $action, string $entity, int $entityId): void
    {
        ActivityLog::create([
            'user_id' => $actor?->id,
            'action' => $action,
            'entity' => $entity,
            'entity_id' => $entityId,
        ]);
    }

    /**
     * POST /admin/reset-demo – chạy lại toàn bộ seed dữ liệu demo.
     * Dùng `db:seed` idempotent (các seeder dùng updateOrCreate/sync).
     * Không drop database nên không mất dữ liệu ngoài phạm vi demo.
     * CHẶN trên môi trường production (ràng buộc Task 03).
     */
    public function resetDemo(): JsonResponse
    {
        if (app()->environment('production')) {
            return response()->json([
                'status' => 'error',
                'message' => 'Không cho phép reset demo trên môi trường production.',
            ], 403);
        }

        Artisan::call('db:seed', ['--force' => true]);

        return response()->json([
            'status' => 'ok',
            'message' => 'Đã reset dữ liệu demo về trạng thái ban đầu.',
        ]);
    }

    /** JSON lỗi thống nhất (khớp DocumentsController). */
    private function error(string $message, int $code): JsonResponse
    {
        return response()->json(['status' => 'error', 'message' => $message], $code);
    }
}
