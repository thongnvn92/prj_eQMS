<?php

namespace Tests\Feature;

use App\Models\Action;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Task 03 – Integration test cho các endpoint workflow:
 * - MasterPlan@updateTask (validate/permission/404/422)
 * - Documents@transition (state machine 200/409, reject 400, permission 403)
 * - Actions@update (ownership 403, verify/close 409, evidence 400, progress 100)
 * - Admin@resetDemo (guard production 403)
 *
 * Không dùng RefreshDatabase: mỗi test bọc DB transaction + rollback
 * để không làm bẩn dữ liệu dev (token/records tạo ra đều bị rollback).
 */
class EndpointWorkflowTest extends TestCase
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

    private function tokenFor(string $username, string $password): string
    {
        $response = $this->postJson('/api/login', [
            'username' => $username,
            'password' => $password,
        ]);
        $response->assertOk();

        return $response->json('token');
    }

    private function authAs(string $username, string $password): array
    {
        return [
            'Authorization' => 'Bearer '.$this->tokenFor($username, $password),
            'Accept' => 'application/json',
        ];
    }

    // ===================== MASTER PLAN – updateTask =====================

    public function test_update_task_success_progress_note(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!'); // có master_plan.update

            $response = $this->withHeaders($headers)->patchJson('/api/master-plan/tasks/2', [
                'progress' => 75,
                'note' => 'Đẩy nhanh tiến độ tuần này',
            ]);

            $response->assertOk();
            $response->assertJsonPath('progress', 75);
            $response->assertJsonPath('note', 'Đẩy nhanh tiến độ tuần này');
            $response->assertJsonPath('code', 'MP-002');
        });
    }

    public function test_update_task_completed_forces_progress_100(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            $response = $this->withHeaders($headers)->patchJson('/api/master-plan/tasks/3', [
                'status' => 'completed',
            ]);

            $response->assertOk();
            $response->assertJsonPath('status', 'completed');
            $response->assertJsonPath('progress', 100);
        });
    }

    public function test_update_task_owner_requires_assign_permission(): void
    {
        $this->tx(function () {
            // coordinator có master_plan.update NHƯNG KHÔNG có master_plan.assign.
            $headers = $this->authAs('coordinator', 'Coord123!');

            $response = $this->withHeaders($headers)->patchJson('/api/master-plan/tasks/2', [
                'ownerId' => 3,
            ]);

            $response->assertStatus(403);
            $response->assertJson(['status' => 'error']);
        });
    }

    public function test_master_plan_returns_sub_tasks_flat(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!'); // có master_plan.create

            // Tạo sub-task (con của task gốc id=2).
            $created = $this->withHeaders($headers)->postJson('/api/master-plan/tasks', [
                'code' => 'MP-TX-SUB',
                'name' => 'Sub-task kiểm thử',
                'phaseId' => 1,
                'parentId' => 2,
                'ownerId' => 1,
                'priority' => 'medium',
                'startDate' => '2026-10-12',
                'dueDate' => '2026-10-23',
            ]);
            $created->assertCreated();
            $subId = (int) $created->json('id');

            // GET /api/master-plan phải trả sub-task trong tasks[] (phẳng, kèm parentId).
            $response = $this->withHeaders($headers)->getJson('/api/master-plan');
            $response->assertOk();
            $rows = collect($response->json('tasks'));
            $this->assertTrue($rows->contains('id', $subId), 'Sub-task phải có trong tasks[] của GET /master-plan');
            $this->assertSame(2, $rows->firstWhere('id', $subId)['parentId']);
        });
    }

    public function test_update_task_validation_progress_out_of_range_422(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            $response = $this->withHeaders($headers)->patchJson('/api/master-plan/tasks/2', [
                'progress' => 150,
            ]);

            $response->assertStatus(422);
            $response->assertJsonValidationErrors(['progress']);
        });
    }

    public function test_update_task_validation_status_invalid_422(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            $response = $this->withHeaders($headers)->patchJson('/api/master-plan/tasks/2', [
                'status' => 'khong_ton_tai',
            ]);

            $response->assertStatus(422);
            $response->assertJsonValidationErrors(['status']);
        });
    }

    public function test_update_task_not_found_404(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            $response = $this->withHeaders($headers)->patchJson('/api/master-plan/tasks/99999', [
                'progress' => 10,
            ]);

            $response->assertStatus(404);
        });
    }

    public function test_update_task_without_token_401(): void
    {
        $response = $this->withHeaders(['Accept' => 'application/json'])
            ->patchJson('/api/master-plan/tasks/2', ['progress' => 10]);

        $response->assertStatus(401);
    }

    public function test_update_task_writes_activity_log_on_status_change(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            $this->withHeaders($headers)->patchJson('/api/master-plan/tasks/5', [
                'status' => 'in_progress',
            ])->assertOk();

            $this->assertDatabaseHas('activity_logs', [
                'action' => 'status_change',
                'entity' => 'master_plan_task',
                'entity_id' => 5,
                'old_status' => 'not_started',
                'new_status' => 'in_progress',
            ]);
        });
    }

    // ===================== DOCUMENTS – transition =====================

    public function test_document_submit_draft_to_reviewing(): void
    {
        $this->tx(function () {
            // deputy có document.submit; doc id 2 đang draft.
            $headers = $this->authAs('deputy', 'Deputy123!');

            $response = $this->withHeaders($headers)->postJson('/api/documents/2/transition', [
                'action' => 'submit',
            ]);

            $response->assertOk();
            $response->assertJsonPath('status', 'reviewing');
            $response->assertJsonPath('code', 'QT-HCNS.02');

            // Ghi document_approvals + activity_log theo schema.
            $this->assertDatabaseHas('document_approvals', [
                'document_id' => 2,
                'action' => 'submit',
                'step' => 'reviewing',
            ]);
            $this->assertDatabaseHas('activity_logs', [
                'action' => 'submit',
                'entity' => 'document',
                'entity_id' => 2,
                'old_status' => 'draft',
                'new_status' => 'reviewing',
            ]);
        });
    }

    public function test_document_review_draft_is_not_allowed_409(): void
    {
        $this->tx(function () {
            // deputy có document.review nhưng doc 2 đang draft → 409.
            $headers = $this->authAs('deputy', 'Deputy123!');

            $response = $this->withHeaders($headers)->postJson('/api/documents/2/transition', [
                'action' => 'review',
            ]);

            $response->assertStatus(409);
        });
    }

    public function test_document_publish_when_not_approved_409(): void
    {
        $this->tx(function () {
            // leader có document.publish nhưng doc 5 đang draft → 409.
            $headers = $this->authAs('leader', 'Leader123!');

            $response = $this->withHeaders($headers)->postJson('/api/documents/5/transition', [
                'action' => 'publish',
            ]);

            $response->assertStatus(409);
        });
    }

    public function test_document_reject_without_comment_400(): void
    {
        $this->tx(function () {
            // leader có document.approve (reject perm); doc 4 đang approval_pending.
            $headers = $this->authAs('leader', 'Leader123!');

            $response = $this->withHeaders($headers)->postJson('/api/documents/4/transition', [
                'action' => 'reject',
            ]);

            $response->assertStatus(400);
            $response->assertJson(['status' => 'error']);
        });
    }

    public function test_document_reject_with_comment_to_draft(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!');

            $response = $this->withHeaders($headers)->postJson('/api/documents/4/transition', [
                'action' => 'reject',
                'comment' => 'Nội dung thiếu phụ lục đính kèm.',
            ]);

            $response->assertOk();
            $response->assertJsonPath('status', 'draft');

            $this->assertDatabaseHas('document_approvals', [
                'document_id' => 4,
                'action' => 'reject',
                'comment' => 'Nội dung thiếu phụ lục đính kèm.',
            ]);
        });
    }

    public function test_document_transition_missing_permission_403(): void
    {
        $this->tx(function () {
            // normal_user chỉ có document.view → submit=403 (kiểm theo TỪNG transition).
            $headers = $this->authAs('user', 'User123!');

            $response = $this->withHeaders($headers)->postJson('/api/documents/2/transition', [
                'action' => 'submit',
            ]);

            $response->assertStatus(403);
        });
    }

    public function test_document_transition_invalid_action_422(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('deputy', 'Deputy123!');

            $response = $this->withHeaders($headers)->postJson('/api/documents/2/transition', [
                'action' => 'delete_forever',
            ]);

            $response->assertStatus(422);
            $response->assertJsonValidationErrors(['action']);
        });
    }

    public function test_document_publish_first_time_creates_v10(): void
    {
        $this->tx(function () {
            // doc 7 approval_pending V0.3 → approve rồi publish (leader: approve+publish).
            $headers = $this->authAs('leader', 'Leader123!');

            $this->withHeaders($headers)->postJson('/api/documents/7/transition', [
                'action' => 'approve',
            ])->assertOk()->assertJsonPath('status', 'approved');

            $response = $this->withHeaders($headers)->postJson('/api/documents/7/transition', [
                'action' => 'publish',
            ]);

            $response->assertOk();
            $response->assertJsonPath('status', 'published');
            $response->assertJsonPath('currentVersion', 'V1.0');

            // Version V1.0 là current + effective_date được set.
            $this->assertDatabaseHas('document_versions', [
                'document_id' => 7,
                'version' => 'V1.0',
                'is_current' => true,
            ]);
        });
    }

    // ===================== ACTIONS – update =====================

    public function test_action_update_progress_as_owner(): void
    {
        $this->tx(function () {
            // ACT-001 (id 1) owner_id=8 = normal_user "user" → được phép update progress.
            $headers = $this->authAs('user', 'User123!');

            $response = $this->withHeaders($headers)->patchJson('/api/actions/1', [
                'progress' => 55,
                'result' => 'Đã xử lý xong phần sự việc.',
            ]);

            $response->assertOk();
            $response->assertJsonPath('progress', 55);
        });
    }

    public function test_action_update_ownership_denied_403(): void
    {
        $this->tx(function () {
            // ACT-002 owner_id=7 (auditor) — normal_user không được đụng.
            $headers = $this->authAs('user', 'User123!');

            $response = $this->withHeaders($headers)->patchJson('/api/actions/2', [
                'progress' => 10,
            ]);

            $response->assertStatus(403);
        });
    }

    public function test_action_verify_wrong_state_409(): void
    {
        $this->tx(function () {
            // coordinator có action.verify; ACT-001 đang in_progress → 409.
            $headers = $this->authAs('coordinator', 'Coord123!');

            $response = $this->withHeaders($headers)->patchJson('/api/actions/1', [
                'status' => 'verified',
            ]);

            $response->assertStatus(409);
        });
    }

    public function test_action_verify_flow_sets_progress_100(): void
    {
        $this->tx(function () {
            // ACT-001: in_progress → pending_verification → verified (progress 100).
            $headers = $this->authAs('coordinator', 'Coord123!');

            $this->withHeaders($headers)->patchJson('/api/actions/1', [
                'status' => 'pending_verification',
            ])->assertOk();

            $response = $this->withHeaders($headers)->patchJson('/api/actions/1', [
                'status' => 'verified',
            ]);

            $response->assertOk();
            $response->assertJsonPath('status', 'verified');
            $response->assertJsonPath('progress', 100);

            $this->assertDatabaseHas('activity_logs', [
                'action' => 'status_change',
                'entity' => 'action',
                'entity_id' => 1,
                'new_status' => 'verified',
            ]);
        });
    }

    public function test_action_close_before_verified_409(): void
    {
        $this->tx(function () {
            // leader có action.close; ACT-001 chưa verified → 409.
            $headers = $this->authAs('leader', 'Leader123!');

            $response = $this->withHeaders($headers)->patchJson('/api/actions/1', [
                'status' => 'closed',
                'evidence' => 'Biên bản BB-001',
            ]);

            $response->assertStatus(409);
        });
    }

    public function test_action_close_requires_evidence_400(): void
    {
        $this->tx(function () {
            // Đảm bảo evidence đang NULL (deterministic, không phụ thuộc dữ liệu seed).
            // Lưu ý: Laravel TrimStrings trim whitespace → không gửi '   ' làm "evidence rỗng".
            Action::where('id', 4)->update(['evidence' => null]);

            // leader có action.close; ACT-004 verified nhưng KHÔNG có evidence → 400.
            $headers = $this->authAs('leader', 'Leader123!');

            $response = $this->withHeaders($headers)->patchJson('/api/actions/4', [
                'status' => 'closed',
            ]);

            $response->assertStatus(400);
            $response->assertJson(['status' => 'error']);
        });
    }

    public function test_action_close_success_sets_progress_100(): void
    {
        $this->tx(function () {
            // ACT-004 verified → closed với evidence → 200, progress=100.
            $headers = $this->authAs('leader', 'Leader123!');

            $response = $this->withHeaders($headers)->patchJson('/api/actions/4', [
                'status' => 'closed',
                'evidence' => 'Biên bản BB-004 + ảnh hiện trường',
            ]);

            $response->assertOk();
            $response->assertJsonPath('status', 'closed');
            $response->assertJsonPath('progress', 100);

            $this->assertDatabaseHas('activity_logs', [
                'action' => 'status_change',
                'entity' => 'action',
                'entity_id' => 4,
                'old_status' => 'verified',
                'new_status' => 'closed',
            ]);
        });
    }

    public function test_action_close_missing_permission_403(): void
    {
        $this->tx(function () {
            // coordinator có action.update/verify NHƯNG không có action.close.
            $headers = $this->authAs('coordinator', 'Coord123!');

            $response = $this->withHeaders($headers)->patchJson('/api/actions/4', [
                'status' => 'closed',
                'evidence' => 'BB',
            ]);

            $response->assertStatus(403);
        });
    }

    public function test_action_update_progress_out_of_range_422(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('user', 'User123!');

            $response = $this->withHeaders($headers)->patchJson('/api/actions/1', [
                'progress' => -5,
            ]);

            $response->assertStatus(422);
            $response->assertJsonValidationErrors(['progress']);
        });
    }

    // ===================== ADMIN – resetDemo & LOOKUPS =====================

    public function test_reset_demo_blocked_in_production_403(): void
    {
        $headers = $this->authAs('admin', 'Admin123!');

        $originalEnv = $this->app['env'];
        $this->app['env'] = 'production';
        try {
            $response = $this->withHeaders($headers)->postJson('/api/admin/reset-demo');
        } finally {
            $this->app['env'] = $originalEnv;
        }

        $response->assertStatus(403);
        $response->assertJson(['status' => 'error']);
    }

    public function test_reset_demo_success_200(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');

            $response = $this->withHeaders($headers)->postJson('/api/admin/reset-demo');

            $response->assertOk();
            $response->assertJsonPath('status', 'ok');
        });
    }

    public function test_reset_demo_missing_permission_403(): void
    {
        $this->tx(function () {
            // user thường không có user.view → 403 (route middleware).
            $headers = $this->authAs('user', 'User123!');

            $response = $this->withHeaders($headers)->postJson('/api/admin/reset-demo');

            $response->assertStatus(403);
        });
    }

    public function test_lookups_contract_shape(): void
    {
        $headers = $this->authAs('user', 'User123!');

        $response = $this->withHeaders($headers)->getJson('/api/lookups');

        $response->assertOk();
        $response->assertJsonStructure([
            'people' => [['id', 'fullName']],
            'departments' => [['id', 'code', 'name']],
            'phases' => [['id', 'code', 'name', 'startDate', 'endDate', 'masterPlanId']],
        ]);
    }
}
