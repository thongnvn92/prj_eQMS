<?php

namespace Tests\Feature;

use App\Models\MasterPlanPhase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * CRUD dữ liệu quản trị (/admin) – Nhóm công việc (Giai đoạn):
 * GET/POST/PATCH/DELETE /admin/phases (quyền module master_plan).
 */
class AdminPhaseCrudTest extends TestCase
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

    // ===================== NHÓM CÔNG VIỆC (PHASE) =====================

    public function test_admin_can_crud_phase(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');

            // CREATE.
            $created = $this->withHeaders($headers)->postJson('/api/admin/phases', [
                'masterPlanId' => 1,
                'code' => 'TXP-'.uniqid(),
                'name' => 'Nhóm công việc kiểm thử',
                'startDate' => '2026-10-01',
                'endDate' => '2026-12-31',
                'sortOrder' => 99,
            ])->assertStatus(201);
            $id = $created->json('id');
            $this->assertNotNull($id);

            // LIST chứa nhóm vừa tạo.
            $list = $this->withHeaders($headers)->getJson('/api/admin/phases')->assertOk();
            $this->assertTrue(collect($list->json())->pluck('id')->contains($id));

            // UPDATE.
            $this->withHeaders($headers)->patchJson("/api/admin/phases/{$id}", [
                'name' => 'Nhóm đã đổi tên',
            ])->assertOk()->assertJsonPath('name', 'Nhóm đã đổi tên');

            // DELETE (nhóm trống → xóa được).
            $this->withHeaders($headers)->deleteJson("/api/admin/phases/{$id}")->assertOk();
            $this->assertSame(0, MasterPlanPhase::where('id', $id)->count());
        });
    }

    public function test_delete_phase_with_tasks_is_blocked_409(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');
            $phaseId = (int) MasterPlanPhase::query()->whereHas('tasks')->value('id');

            $this->withHeaders($headers)
                ->deleteJson("/api/admin/phases/{$phaseId}")
                ->assertStatus(409);
        });
    }

    public function test_phase_duplicate_code_in_plan_409(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');

            $this->withHeaders($headers)->postJson('/api/admin/phases', [
                'masterPlanId' => 1,
                'code' => 'P1', // đã có trong seed
                'name' => 'Trùng mã',
                'startDate' => '2026-10-01',
                'endDate' => '2026-12-31',
            ])->assertStatus(409);
        });
    }

    public function test_phase_crud_requires_master_plan_permission(): void
    {
        $this->tx(function () {
            // normal_user không có master_plan.view → GET 403.
            $headers = $this->authAs('user', 'User123!');
            $this->withHeaders($headers)->getJson('/api/admin/phases')->assertStatus(403);

            // coordinator có master_plan.view nhưng thiếu create → POST 403.
            $coord = $this->authAs('coordinator', 'Coord123!');
            $this->withHeaders($coord)->postJson('/api/admin/phases', [
                'masterPlanId' => 1, 'code' => 'X', 'name' => 'X',
                'startDate' => '2026-10-01', 'endDate' => '2026-10-02',
            ])->assertStatus(403);
        });
    }
}