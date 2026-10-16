<?php

namespace Tests\Feature;

use App\Models\Action;
use App\Models\MasterPlanTask;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * Task 06 – Full integration chain (một test, MỘT token xuyên suốt):
 * login → me → lookups → master-plan → updateTask → dashboard →
 * documents → transition → actions update → revoke token → 401.
 *
 * Bọc transaction + rollback: mọi record/token tạo ra đều bị xóa cuối test
 * (không phụ thuộc thứ tự chạy, không làm bẩn dữ liệu dev).
 */
class IntegrationFlowTest extends TestCase
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

    public function test_full_chain_login_to_action_update_then_revoke(): void
    {
        $this->tx(function () {
            $accept = ['Accept' => 'application/json'];

            // ---- 1. LOGIN (deputy có master_plan.update + document.review + action.update) ----
            $login = $this->postJson('/api/login', [
                'username' => 'deputy',
                'password' => 'Deputy123!',
            ]);
            $login->assertOk();
            $login->assertJsonStructure(['token', 'user' => [
                'id', 'username', 'fullName', 'departmentId', 'departmentName',
                'roleCodes', 'roleNames', 'permissions',
            ]]);
            $this->assertContains('master_plan.update', $login->json('user.permissions'));

            $token = $login->json('token');
            $headers = ['Authorization' => 'Bearer '.$token] + $accept;

            // ---- 2. /me với token vừa nhận ----
            $me = $this->withHeaders($headers)->getJson('/api/me');
            $me->assertOk();
            $this->assertSame('deputy', $me->json('username'));
            $this->assertArrayNotHasKey('password', $me->json());

            // ---- 3. LOOKUPS ----
            $lookups = $this->withHeaders($headers)->getJson('/api/lookups');
            $lookups->assertOk();
            $this->assertNotEmpty($lookups->json('people'));
            $this->assertNotEmpty($lookups->json('departments'));
            $this->assertNotEmpty($lookups->json('phases'));

            // ---- 4. MASTER PLAN – đọc ----
            $mp = $this->withHeaders($headers)->getJson('/api/master-plan');
            $mp->assertOk();
            $this->assertNotEmpty($mp->json('tasks'));
            $this->assertNotEmpty($mp->json('phases'));

            // ---- 5. UPDATE TASK (deputy có master_plan.update) ----
            $task = MasterPlanTask::find(2);
            $this->assertNotNull($task, 'Task id=2 phải tồn tại trong seed');
            $update = $this->withHeaders($headers)->patchJson('/api/master-plan/tasks/2', [
                'progress' => 45,
                'note' => 'Cập nhật từ integration chain',
            ]);
            $update->assertOk();
            $update->assertJsonPath('progress', 45);
            $update->assertJsonPath('note', 'Cập nhật từ integration chain');
            $this->assertSame(45, (int) $task->fresh()->progress, 'DB phản ánh progress sau update');

            // ---- 6. DASHBOARD – chỉ số nhất quán với DB (đọc lại sau khi update) ----
            $dash = $this->withHeaders($headers)->getJson('/api/dashboard');
            $dash->assertOk();
            $json = $dash->json();
            $total = MasterPlanTask::count();
            $this->assertSame($total, $json['taskTotal']);
            $this->assertSame(
                MasterPlanTask::where('status', 'completed')->count(),
                $json['taskCompleted'],
            );
            $this->assertSame(
                $json['taskTotal'],
                (int) collect($json['tasksByStatus'])->sum('count'),
            );

            // ---- 7. DOCUMENTS – đọc danh sách ----
            $docs = $this->withHeaders($headers)->getJson('/api/documents');
            $docs->assertOk();
            $this->assertNotEmpty($docs->json());
            $this->assertSame('draft', collect($docs->json())->firstWhere('id', 2)['status'] ?? null);

            // ---- 8. TRANSITION: submit doc 2 draft → reviewing (deputy có document.submit) ----
            $transition = $this->withHeaders($headers)->postJson('/api/documents/2/transition', [
                'action' => 'submit',
            ]);
            $transition->assertOk();
            $transition->assertJsonPath('status', 'reviewing');
            $transition->assertJsonPath('code', 'QT-HCNS.02');

            // Transition ghi approvals + activity_log.
            $this->assertDatabaseHas('document_approvals', [
                'document_id' => 2,
                'action' => 'submit',
                'step' => 'reviewing',
            ]);

            // ---- 9. RBAC vẫn chặn trong cùng phiên: /admin/users với deputy → 403 ----
            $this->withHeaders($headers)->getJson('/api/admin/users')->assertStatus(403);

            // ---- 10. ACTIONS – đọc + update (deputy là owner action id=4, có action.update) ----
            $actions = $this->withHeaders($headers)->getJson('/api/actions');
            $actions->assertOk();
            $this->assertNotEmpty($actions->json());

            $actionUpdate = $this->withHeaders($headers)->patchJson('/api/actions/4', [
                'result' => 'Đã kiểm kê xong 12/12 tài liệu (integration chain)',
            ]);
            $actionUpdate->assertOk();
            $actionUpdate->assertJsonPath('code', 'ACT-004');
            $this->assertStringContainsString(
                'integration chain',
                (string) Action::find(4)->result,
            );

            // ---- 11. REVOKE token (tự xóa phiên) → request kế tiếp 401 ----
            $tokenId = (int) explode('|', $token)[0];
            PersonalAccessToken::where('id', $tokenId)->delete();
            // Trong cùng một test, Application + auth guard được cache giữa các request
            // (runtime HTTP thật mỗi request có app mới → không cần dòng này).
            $this->app['auth']->forgetGuards();

            $this->withHeaders($headers)->getJson('/api/me')->assertStatus(401);
            $this->withHeaders($headers)->getJson('/api/dashboard')->assertStatus(401);
        });
    }
}
