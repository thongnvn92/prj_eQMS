<?php

namespace App\Http\Controllers\Api;

use App\Enums\LogEntity;
use App\Http\Controllers\Controller;
use App\Http\Resources\RoleResource;
use App\Http\Resources\UserResource;
use App\Models\ActivityLog;
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
