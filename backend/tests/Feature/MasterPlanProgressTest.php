<?php

namespace Tests\Feature;

use App\Models\MasterPlanTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * CR Master Plan ISO – PATCH /api/master-plan/tasks/{id}/progress.
 *
 * - Người phụ trách task (owner, chỉ có master_plan.view) cập nhật tiến độ CỦA MÌNH → 200.
 * - Không phải owner & không có master_plan.update → 403.
 * - Người có master_plan.update (deputy) cập nhật task của người khác → 200.
 * - Validate progress 0..100 → 422; trạng thái tự suy ra theo tiến độ:
 *   0 → not_started, 1..99 → in_progress, 100 → completed, quá deadline → delayed;
 *   blocked/cancelled giữ nguyên (trạng thái thủ công).
 * - Chưa đăng nhập → 401; thiếu master_plan.view (route middleware) → 403; id không tồn tại → 404.
 *
 * Không dùng RefreshDatabase: mỗi test bọc transaction + rollback (giống EndpointWorkflowTest)
 * để không làm bẩn dữ liệu dev.
 */
class MasterPlanProgressTest extends TestCase
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

    /** Tạo task tạm (owner + trạng thái) – tự xoá khi rollback. */
    private function makeTask(int $ownerId, string $status = 'in_progress', int $progress = 10): MasterPlanTask
    {
        return MasterPlanTask::create([
            'phase_id' => 1,
            'code' => 'TX-PROGRESS',
            'name' => 'Task kiểm thử tiến độ (CR Master Plan ISO)',
            'owner_id' => $ownerId,
            'department_id' => 2,
            'priority' => 'medium',
            'status' => $status,
            'progress' => $progress,
            'start_date' => '2026-10-01',
            'due_date' => '2026-12-31',
        ]);
    }

    private function userId(string $username): int
    {
        return (int) User::where('username', $username)->value('id');
    }

    public function test_owner_updates_own_progress_200(): void
    {
        $this->tx(function () {
            $task = $this->makeTask($this->userId('manager'));
            $headers = $this->authAs('manager', 'Manager123!'); // dept_manager: chỉ có master_plan.view

            $response = $this->withHeaders($headers)->patchJson("/api/master-plan/tasks/{$task->id}/progress", [
                'progress' => 60,
            ]);

            $response->assertOk();
            $response->assertJsonPath('progress', 60);
            $response->assertJsonPath('id', $task->id);

            // Audit trail: action=update (KHÔNG phải status_change).
            $this->assertDatabaseHas('activity_logs', [
                'entity' => 'master_plan_task',
                'entity_id' => $task->id,
                'action' => 'update',
            ]);
        });
    }

    public function test_non_owner_without_update_permission_403(): void
    {
        $this->tx(function () {
            $task = $this->makeTask($this->userId('leader')); // owner = leader
            $headers = $this->authAs('manager', 'Manager123!'); // không phải owner, không có master_plan.update

            $response = $this->withHeaders($headers)->patchJson("/api/master-plan/tasks/{$task->id}/progress", [
                'progress' => 60,
            ]);

            $response->assertStatus(403);
            $response->assertJson(['status' => 'error']);
        });
    }

    public function test_update_permission_holder_can_update_any_task_200(): void
    {
        $this->tx(function () {
            $task = $this->makeTask($this->userId('manager'));
            $headers = $this->authAs('deputy', 'Deputy123!'); // iso_deputy: có master_plan.update

            $response = $this->withHeaders($headers)->patchJson("/api/master-plan/tasks/{$task->id}/progress", [
                'progress' => 80,
            ]);

            $response->assertOk();
            $response->assertJsonPath('progress', 80);
        });
    }

    public function test_progress_out_of_range_422(): void
    {
        $this->tx(function () {
            $task = $this->makeTask($this->userId('manager'));
            $headers = $this->authAs('manager', 'Manager123!');

            $response = $this->withHeaders($headers)->patchJson("/api/master-plan/tasks/{$task->id}/progress", [
                'progress' => 150,
            ]);

            $response->assertStatus(422);
            $response->assertJsonValidationErrors(['progress']);
        });
    }

    public function test_missing_progress_422(): void
    {
        $this->tx(function () {
            $task = $this->makeTask($this->userId('manager'));
            $headers = $this->authAs('manager', 'Manager123!');

            $response = $this->withHeaders($headers)->patchJson("/api/master-plan/tasks/{$task->id}/progress", []);

            $response->assertStatus(422);
            $response->assertJsonValidationErrors(['progress']);
        });
    }

    public function test_progress_100_derives_completed_and_back_to_in_progress(): void
    {
        $this->tx(function () {
            $task = $this->makeTask($this->userId('manager'), 'in_progress', 10);
            $headers = $this->authAs('manager', 'Manager123!');

            // 100% ⇒ Hoàn thành.
            $this->withHeaders($headers)->patchJson("/api/master-plan/tasks/{$task->id}/progress", [
                'progress' => 100,
            ])->assertOk()->assertJsonPath('progress', 100)->assertJsonPath('status', 'completed');

            // Hạ lại 50% ⇒ Đang thực hiện (completed chỉ còn khi progress=100).
            $this->withHeaders($headers)->patchJson("/api/master-plan/tasks/{$task->id}/progress", [
                'progress' => 50,
            ])->assertOk()->assertJsonPath('progress', 50)->assertJsonPath('status', 'in_progress');
        });
    }

    public function test_progress_zero_on_future_deadline_derives_not_started(): void
    {
        $this->tx(function () {
            $task = $this->makeTask($this->userId('manager'), 'in_progress', 45); // due 2026-12-31 (chưa quá hạn)
            $headers = $this->authAs('manager', 'Manager123!');

            $this->withHeaders($headers)->patchJson("/api/master-plan/tasks/{$task->id}/progress", [
                'progress' => 0,
            ])->assertOk()->assertJsonPath('status', 'not_started');
        });
    }

    public function test_progress_on_overdue_task_derives_delayed(): void
    {
        $this->tx(function () {
            $task = $this->makeTask($this->userId('manager'), 'not_started', 0);
            $task->update(['due_date' => now()->subDay()->format('Y-m-d')]);
            $headers = $this->authAs('manager', 'Manager123!');

            $this->withHeaders($headers)->patchJson("/api/master-plan/tasks/{$task->id}/progress", [
                'progress' => 20,
            ])->assertOk()->assertJsonPath('status', 'delayed');
        });
    }

    public function test_blocked_status_is_preserved_on_progress_update(): void
    {
        $this->tx(function () {
            $task = $this->makeTask($this->userId('manager'), 'blocked', 10);
            $headers = $this->authAs('manager', 'Manager123!');

            $this->withHeaders($headers)->patchJson("/api/master-plan/tasks/{$task->id}/progress", [
                'progress' => 30,
            ])->assertOk()->assertJsonPath('status', 'blocked');
        });
    }

    public function test_unauthenticated_401(): void
    {
        $this->tx(function () {
            $task = $this->makeTask($this->userId('manager'));

            $response = $this->withHeader('Accept', 'application/json')
                ->patchJson("/api/master-plan/tasks/{$task->id}/progress", ['progress' => 50]);

            $response->assertStatus(401);
        });
    }

    public function test_missing_view_permission_403(): void
    {
        $this->tx(function () {
            $task = $this->makeTask($this->userId('manager'));
            $headers = $this->authAs('user', 'User123!'); // normal_user: KHÔNG có master_plan.view

            $response = $this->withHeaders($headers)->patchJson("/api/master-plan/tasks/{$task->id}/progress", [
                'progress' => 50,
            ]);

            $response->assertStatus(403);
        });
    }

    public function test_task_not_found_404(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('manager', 'Manager123!');

            $response = $this->withHeaders($headers)->patchJson('/api/master-plan/tasks/999999/progress', [
                'progress' => 50,
            ]);

            $response->assertStatus(404);
        });
    }
}
