<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Admin CRUD – Người dùng + Vai trò & Phân quyền:
 * - super_admin: tạo/sửa/xóa user; tạo role mới, sửa phân quyền, xóa role tùy chỉnh.
 * - Chặn: normal_user 403; tự xóa/tự disable 409; xóa vai trò chuẩn 409; xóa role đang gán 409.
 * Bọc transaction + rollback (không làm bẩn dữ liệu dev).
 */
class AdminCrudTest extends TestCase
{
    /** Chạy callback trong transaction rồi rollback (dọn sạch tác dụng phụ). */
    private function tx(callable $fn): void
    {
        DB::beginTransaction();
        try {
            $fn();
        } finally {
            DB::rollBack();
        }
    }

    private function authAs(string $username, string $password): array
    {
        $response = $this->postJson('/api/login', [
            'username' => $username,
            'password' => $password,
        ]);
        $response->assertOk();

        return [
            'Authorization' => 'Bearer '.$response->json('token'),
            'Accept' => 'application/json',
        ];
    }

    // ===================== Users CRUD =====================

    public function test_admin_can_create_update_and_delete_user(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');

            // CREATE
            $created = $this->postJson('/api/admin/users', [
                'username' => 'test.crud',
                'password' => 'Secret123!',
                'fullName' => 'User CRUD Test',
                'email' => 'crud.test@dmc.vn',
                'departmentId' => 2,
                'roleCodes' => ['iso_member', 'auditor'],
                'active' => true,
            ], $headers);
            $created->assertCreated();
            $id = $created->json('id');
            $this->assertNotNull($id);
            $this->assertSame('test.crud', $created->json('username'));
            $this->assertEqualsCanonicalizing(['iso_member', 'auditor'], $created->json('roleCodes'));
            // password không được lộ trong response
            $this->assertArrayNotHasKey('password', $created->json());

            // UPDATE (đổi tên + đổi role + set password mới)
            $updated = $this->patchJson('/api/admin/users/'.$id, [
                'fullName' => 'User CRUD Updated',
                'roleCodes' => ['iso_coordinator'],
                'password' => 'NewSecret456!',
            ], $headers);
            $updated->assertOk();
            $this->assertSame('User CRUD Updated', $updated->json('fullName'));
            $this->assertSame(['iso_coordinator'], $updated->json('roleCodes'));

            // login bằng mật khẩu mới vẫn được
            $this->postJson('/api/login', ['username' => 'test.crud', 'password' => 'NewSecret456!'])
                ->assertOk();

            // disable rồi không login được nữa (inactive → 403)
            $this->patchJson('/api/admin/users/'.$id, ['active' => false], $headers)
                ->assertOk();
            $this->postJson('/api/login', ['username' => 'test.crud', 'password' => 'NewSecret456!'])
                ->assertStatus(403);

            // DELETE
            $deleted = $this->deleteJson('/api/admin/users/'.$id, [], $headers);
            $deleted->assertOk();
            $this->assertSame('ok', $deleted->json('status'));
            $this->assertDatabaseMissing('users', ['id' => $id, 'deleted_at' => null]);
        });
    }

    public function test_admin_cannot_delete_or_disable_own_account(): void
    {
        $headers = $this->authAs('admin', 'Admin123!');
        $me = $this->getJson('/api/me', $headers)->assertOk()->json();

        $this->deleteJson('/api/admin/users/'.$me['id'], [], $headers)->assertStatus(409);
        $this->patchJson('/api/admin/users/'.$me['id'], ['active' => false], $headers)->assertStatus(409);
    }

    // ===================== Roles CRUD =====================

    public function test_admin_can_create_role_update_permissions_and_delete_custom_role(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');

            // CREATE role tùy chỉnh
            $created = $this->postJson('/api/admin/roles', [
                'code' => 'quality_manager',
                'name' => 'Quality Manager',
                'description' => 'Quản lý chất lượng',
                'permissions' => ['dashboard.view', 'action.view', 'action.update'],
            ], $headers);
            $created->assertCreated();
            $roleId = $created->json('id');
            $this->assertSame('quality_manager', $created->json('code'));
            $this->assertEqualsCanonicalizing(['dashboard.view', 'action.view', 'action.update'], $created->json('permissions'));

            // UPDATE phân quyền (thêm document.view, bỏ action.update)
            $updated = $this->patchJson('/api/admin/roles/'.$roleId, [
                'name' => 'Quality Manager (updated)',
                'permissions' => ['dashboard.view', 'document.view'],
            ], $headers);
            $updated->assertOk();
            $this->assertSame('Quality Manager (updated)', $updated->json('name'));
            $this->assertEqualsCanonicalizing(['dashboard.view', 'document.view'], $updated->json('permissions'));

            // gán role cho user rồi xóa → 409 (đang có user)
            $user = $this->postJson('/api/admin/users', [
                'username' => 'qm.user', 'password' => 'Secret123!', 'fullName' => 'QM User',
                'roleCodes' => ['quality_manager'],
            ], $headers)->assertCreated();
            $this->deleteJson('/api/admin/roles/'.$roleId, [], $headers)->assertStatus(409);

            // gỡ role khỏi user → xóa được
            $this->patchJson('/api/admin/users/'.$user->json('id'), ['roleCodes' => []], $headers)->assertOk();
            $deleted = $this->deleteJson('/api/admin/roles/'.$roleId, [], $headers);
            $deleted->assertOk();
            $this->assertSame('ok', $deleted->json('status'));
        });
    }

    public function test_admin_cannot_delete_standard_roles(): void
    {
        $headers = $this->authAs('admin', 'Admin123!');
        $roles = $this->getJson('/api/admin/roles', $headers)->assertOk()->json();
        $superAdmin = collect($roles)->firstWhere('code', 'super_admin');

        $this->assertNotNull($superAdmin);
        $this->deleteJson('/api/admin/roles/'.$superAdmin['id'], [], $headers)->assertStatus(409);
    }

    // ===================== RBAC + validation =====================

    public function test_normal_user_gets_403_on_admin_crud(): void
    {
        $headers = $this->authAs('user', 'User123!');

        $this->postJson('/api/admin/users', [
            'username' => 'x.y', 'password' => 'Secret123!', 'fullName' => 'X Y',
        ], $headers)->assertStatus(403);

        $this->postJson('/api/admin/roles', [
            'code' => 'x_role', 'name' => 'X',
        ], $headers)->assertStatus(403);

        $this->patchJson('/api/admin/roles/1', ['name' => 'Hack'], $headers)->assertStatus(403);
        $this->deleteJson('/api/admin/users/2', [], $headers)->assertStatus(403);
    }

    public function test_store_user_validates_input(): void
    {
        $headers = $this->authAs('admin', 'Admin123!');

        // username trùng
        $this->postJson('/api/admin/users', [
            'username' => 'admin', 'password' => 'Secret123!', 'fullName' => 'Duplicate',
        ], $headers)->assertStatus(422);

        // password quá ngắn
        $this->postJson('/api/admin/users', [
            'username' => 'short.pw', 'password' => '123', 'fullName' => 'Short PW',
        ], $headers)->assertStatus(422);

        // role không tồn tại
        $this->postJson('/api/admin/users', [
            'username' => 'bad.role', 'password' => 'Secret123!', 'fullName' => 'Bad Role',
            'roleCodes' => ['not_exists'],
        ], $headers)->assertStatus(422);
    }
}
