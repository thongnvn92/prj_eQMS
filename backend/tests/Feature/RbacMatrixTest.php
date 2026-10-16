<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Task 06 – Ma trận RBAC cho API:
 * - 401 khi thiếu token trên MỌI route bảo vệ (loop – không liệt kê tay từng cái).
 * - 403/200 theo từng role (route middleware + controller-level permission).
 * Bọc transaction + rollback (không làm bẩn dữ liệu dev).
 */
class RbacMatrixTest extends TestCase
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

    // ===================== 401 – mọi route bảo vệ khi thiếu token =====================

    public function test_protected_routes_return_401_without_token(): void
    {
        $routes = [
            ['GET', '/api/me', []],
            ['GET', '/api/lookups', []],
            ['GET', '/api/master-plan', []],
            ['GET', '/api/dashboard', []],
            ['GET', '/api/documents', []],
            ['GET', '/api/actions', []],
            ['GET', '/api/admin/users', []],
            ['GET', '/api/admin/roles', []],
            ['PATCH', '/api/master-plan/tasks/2', ['progress' => 10]],
            ['PATCH', '/api/actions/1', ['progress' => 10]],
            ['POST', '/api/documents/2/transition', ['action' => 'submit']],
            ['POST', '/api/admin/reset-demo', []],
        ];

        foreach ($routes as [$method, $uri, $body]) {
            $response = $this->json($method, $uri, $body, ['Accept' => 'application/json']);
            $this->assertSame(
                401,
                $response->getStatusCode(),
                "{$method} {$uri} phải trả 401 khi thiếu token",
            );
        }
    }

    // ===================== 403/200 – theo role =====================

    public function test_normal_user_cannot_view_master_plan_403(): void
    {
        // normal_user không có master_plan.view → route middleware 403.
        $headers = $this->authAs('user', 'User123!');

        $this->withHeaders($headers)->getJson('/api/master-plan')->assertStatus(403);
    }

    public function test_normal_user_cannot_update_master_plan_task_403(): void
    {
        // normal_user không có master_plan.update → 403 (middleware chặn trước validate).
        $headers = $this->authAs('user', 'User123!');

        $this->withHeaders($headers)
            ->patchJson('/api/master-plan/tasks/2', ['progress' => 10])
            ->assertStatus(403);
    }

    public function test_coordinator_can_view_and_update_master_plan(): void
    {
        $this->tx(function () {
            // iso_coordinator có master_plan.view + master_plan.update → 200.
            $headers = $this->authAs('coordinator', 'Coord123!');

            $this->withHeaders($headers)->getJson('/api/master-plan')->assertOk();

            $this->withHeaders($headers)
                ->patchJson('/api/master-plan/tasks/2', ['progress' => 62])
                ->assertOk()
                ->assertJsonPath('progress', 62);
        });
    }

    public function test_leader_cannot_access_admin_users_403(): void
    {
        // iso_leader KHÔNG có user.view → 403 (khác super_admin).
        $headers = $this->authAs('leader', 'Leader123!');

        $this->withHeaders($headers)->getJson('/api/admin/users')->assertStatus(403);
    }

    public function test_leader_cannot_reset_demo_403(): void
    {
        $this->tx(function () {
            // iso_leader không có user.view → middleware chặn trước khi reset chạy.
            $headers = $this->authAs('leader', 'Leader123!');

            $this->withHeaders($headers)->postJson('/api/admin/reset-demo')->assertStatus(403);
        });
    }

    public function test_manager_cannot_access_admin_roles_403(): void
    {
        // dept_manager không có user.view (route nhóm /admin yêu cầu user.view).
        $headers = $this->authAs('manager', 'Manager123!');

        $this->withHeaders($headers)->getJson('/api/admin/roles')->assertStatus(403);
    }

    public function test_admin_can_access_admin_endpoints_200(): void
    {
        $headers = $this->authAs('admin', 'Admin123!');

        $this->withHeaders($headers)->getJson('/api/admin/users')->assertOk();
        $this->withHeaders($headers)->getJson('/api/admin/roles')->assertOk();
    }

    public function test_auditor_can_view_but_cannot_update_actions(): void
    {
        $this->tx(function () {
            // auditor có action.view → GET 200; thiếu action.update|verify → PATCH 403 (route middleware).
            $headers = $this->authAs('auditor', 'Audit123!');

            $this->withHeaders($headers)->getJson('/api/actions')->assertOk();

            $this->withHeaders($headers)
                ->patchJson('/api/actions/1', ['progress' => 10])
                ->assertStatus(403);
        });
    }

    public function test_leader_cannot_submit_document_403(): void
    {
        $this->tx(function () {
            // iso_leader có document.view|review|approve|publish (qua route middleware)
            // nhưng THIẾU document.submit → controller từ chối transition 'submit'.
            $headers = $this->authAs('leader', 'Leader123!');

            $this->withHeaders($headers)
                ->postJson('/api/documents/2/transition', ['action' => 'submit'])
                ->assertStatus(403);
        });
    }

    public function test_normal_user_can_view_documents_200(): void
    {
        // normal_user có document.view → GET /documents 200 (submit bị chặn – test ở trên).
        $headers = $this->authAs('user', 'User123!');

        $this->withHeaders($headers)->getJson('/api/documents')->assertOk();
    }

    // ===================== Document create/update – Ban ISO được phép =====================

    /**
     * @dataProvider isoMembers
     */
    public function test_iso_members_can_create_document(string $username, string $password): void
    {
        $this->tx(function () use ($username, $password) {
            // Toàn bộ thành viên Ban ISO (leader/deputy/member/coordinator) đều có document.create.
            $headers = $this->authAs($username, $password);
            $code = 'TC-'.uniqid().'-'.strtoupper(substr($username, 0, 3));

            $this->withHeaders($headers)->postJson('/api/documents', [
                'code' => $code,
                'name' => 'Tài liệu kiểm thử '.$username,
                'docType' => 'procedure',
                'description' => 'Tạo bởi test Ban ISO',
            ])
                ->assertStatus(201)
                ->assertJsonPath('status', 'draft')
                ->assertJsonPath('currentVersion', 'V0.1');
        });
    }

    /**
     * @dataProvider isoMembers
     */
    public function test_iso_members_can_update_draft_document(string $username, string $password): void
    {
        $this->tx(function () use ($username, $password) {
            $headers = $this->authAs($username, $password);

            // Document id=2 (QT-HCNS.02) ở trạng thái draft → Ban ISO được sửa.
            $this->withHeaders($headers)
                ->patchJson('/api/documents/2', [
                    'name' => 'Quy trình đào tạo (sửa bởi '.$username.')',
                    'changeSummary' => 'Cập nhật nội dung dự thảo',
                ])
                ->assertOk()
                ->assertJsonPath('status', 'draft');
        });
    }

    public function test_iso_member_cannot_update_non_draft_document_409(): void
    {
        $this->tx(function () {
            // member có document.update nhưng document id=1 đã published → 409 (chỉ sửa khi draft).
            $headers = $this->authAs('deputy', 'Deputy123!');

            $this->withHeaders($headers)
                ->patchJson('/api/documents/1', ['name' => 'Cố sửa tài liệu đã ban hành'])
                ->assertStatus(409);
        });
    }

    public function test_normal_user_cannot_create_document_403(): void
    {
        // normal_user không có document.create → 403.
        $headers = $this->authAs('user', 'User123!');

        $this->withHeaders($headers)->postJson('/api/documents', [
            'code' => 'TC-NO-'.uniqid(),
            'name' => 'Không được phép',
            'docType' => 'procedure',
        ])->assertStatus(403);
    }

    public static function isoMembers(): array
    {
        return [
            'leader' => ['leader', 'Leader123!'],
            'deputy' => ['deputy', 'Deputy123!'],
            'coordinator' => ['coordinator', 'Coord123!'],
        ];
    }
}
