<?php

namespace Tests\Feature;

use App\Models\Department;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * CRUD dữ liệu quản trị (/admin) – Phòng ban:
 * GET/POST/PATCH/DELETE /admin/departments (department.view / department.manage).
 */
class AdminDepartmentCrudTest extends TestCase
{
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

    public function test_admin_can_crud_department(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');

            $created = $this->withHeaders($headers)->postJson('/api/admin/departments', [
                'code' => 'TXD-'.strtoupper(substr(uniqid(), -6)),
                'name' => 'Phòng kiểm thử',
                'description' => 'Tạo bởi AdminDepartmentCrudTest',
                'isActive' => true,
            ])->assertStatus(201);
            $id = $created->json('id');

            $list = $this->withHeaders($headers)->getJson('/api/admin/departments')->assertOk();
            $this->assertTrue(collect($list->json())->pluck('id')->contains($id));

            $this->withHeaders($headers)->patchJson("/api/admin/departments/{$id}", [
                'name' => 'Phòng kiểm thử (đã sửa)',
                'isActive' => false,
            ])->assertOk()->assertJsonPath('name', 'Phòng kiểm thử (đã sửa)');

            $this->withHeaders($headers)->deleteJson("/api/admin/departments/{$id}")->assertOk();
            $this->assertSame(0, Department::where('id', $id)->count());
        });
    }

    public function test_delete_department_in_use_is_blocked_409(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');
            // Phòng Ban ISO (id=2) đang có user + tài liệu → không xóa được.
            $this->withHeaders($headers)->deleteJson('/api/admin/departments/2')->assertStatus(409);
        });
    }

    public function test_department_crud_requires_department_manage(): void
    {
        $this->tx(function () {
            // deputy có department.view (GET ok) nhưng thiếu department.manage → POST 403.
            $headers = $this->authAs('deputy', 'Deputy123!');
            $this->withHeaders($headers)->getJson('/api/admin/departments')->assertOk();
            $this->withHeaders($headers)->postJson('/api/admin/departments', [
                'code' => 'NOPE', 'name' => 'Không có quyền',
            ])->assertStatus(403);
        });
    }
}