<?php

namespace Tests\Feature;

use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * Task 02 – Kiểm chứng API response khớp contract camelCase của frontend.
 *
 * Không dùng RefreshDatabase (tránh xóa dữ liệu dev). Dùng user đã seed,
 * tự dọn token trong tearDown. Mỗi test đăng nhập để lấy Bearer token.
 */
class ApiContractTest extends TestCase
{
    private array $tokenIds = [];

    protected function tearDown(): void
    {
        if (! empty($this->tokenIds)) {
            PersonalAccessToken::whereIn('id', $this->tokenIds)->delete();
        }
        $this->tokenIds = [];
        parent::tearDown();
    }

    private function token(string $username, string $password): string
    {
        $res = $this->postJson('/api/login', compact('username', 'password'));
        $res->assertOk();
        $token = $res->json('token');
        $id = (int) explode('|', $token)[0];
        if ($id > 0) {
            $this->tokenIds[] = $id;
        }

        return $token;
    }

    private function authGet(string $path, string $token): array
    {
        $res = $this->withHeaders([
            'Authorization' => 'Bearer '.$token,
            'Accept' => 'application/json',
        ])->getJson($path);

        return [$res, $res->json()];
    }

    /** Assert đệ quy: không tồn tại key snake_case. */
    private function assertNoSnakeCase($node, string $path = '$'): void
    {
        if (! is_array($node)) {
            return;
        }
        foreach ($node as $k => $v) {
            if (is_string($k)) {
                $this->assertDoesNotMatchRegularExpression(
                    '/^[a-z]+(_[a-z0-9]+)+$/',
                    $k,
                    "Phát hiện key snake_case '{$k}' tại {$path}.{$k} (phải là camelCase)."
                );
            }
            $this->assertNoSnakeCase($v, $path.'.'.(string) $k);
        }
    }

    public function test_lookups_contract(): void
    {
        $token = $this->token('leader', 'Leader123!');
        [$res, $body] = $this->authGet('/api/lookups', $token);
        $res->assertOk();

        $this->assertArrayHasKey('people', $body);
        $this->assertArrayHasKey('departments', $body);
        $this->assertArrayHasKey('phases', $body);
        if (! empty($body['people'])) {
            $this->assertArrayHasKey('fullName', $body['people'][0]);
        }
        if (! empty($body['departments'][0])) {
            $this->assertSame(['id', 'code', 'name'], array_keys($body['departments'][0]));
        }
        if (! empty($body['phases'][0])) {
            $this->assertSame(
                ['id', 'code', 'name', 'startDate', 'endDate', 'masterPlanId'],
                array_keys($body['phases'][0])
            );
        }
        $this->assertNoSnakeCase($body);
    }

    public function test_master_plan_contract(): void
    {
        $token = $this->token('leader', 'Leader123!');
        [$res, $body] = $this->authGet('/api/master-plan', $token);
        $res->assertOk();

        $this->assertArrayHasKey('phases', $body);
        $this->assertArrayHasKey('tasks', $body);
        $this->assertArrayHasKey('plans', $body);
        $this->assertNotEmpty($body['tasks']);

        $task = $body['tasks'][0];
        $this->assertSame(
            ['id', 'code', 'name', 'phaseId', 'parentId', 'sortOrder', 'ownerId', 'departmentId', 'priority', 'status', 'progress', 'startDate', 'dueDate', 'result', 'note'],
            array_keys($task)
        );
        $this->assertContains($task['status'], ['not_started', 'in_progress', 'blocked', 'delayed', 'completed', 'cancelled']);
        $this->assertContains($task['priority'], ['critical', 'high', 'medium', 'low']);
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}$/', $task['startDate']);
        $this->assertIsInt($task['progress']);
        $this->assertNoSnakeCase($body);
    }

    public function test_documents_contract(): void
    {
        $token = $this->token('leader', 'Leader123!');
        [$res, $body] = $this->authGet('/api/documents', $token);
        $res->assertOk();
        $this->assertNotEmpty($body);

        $doc = $body[0];
        $this->assertSame(
            ['id', 'code', 'name', 'docType', 'departmentId', 'ownerId', 'currentVersion', 'status', 'statusUpdatedAt', 'autoVersion', 'createdAt', 'updatedAt', 'workflowStep', 'relatedTaskId', 'description', 'effectiveDate', 'versions', 'approvals', 'files'],
            array_keys($doc)
        );
        $this->assertIsArray($doc['versions']);
        $this->assertIsArray($doc['files']);
        $this->assertIsArray($doc['approvals']);
        $this->assertNoSnakeCase($body);
    }

    public function test_actions_contract(): void
    {
        $token = $this->token('leader', 'Leader123!');
        [$res, $body] = $this->authGet('/api/actions', $token);
        $res->assertOk();
        $this->assertNotEmpty($body);

        $action = $body[0];
        foreach (['id', 'code', 'title', 'source', 'departmentId', 'ownerId', 'issue', 'dueDate', 'status', 'progress'] as $key) {
            $this->assertArrayHasKey($key, $action);
        }
        $this->assertContains($action['status'], ['open', 'in_progress', 'blocked', 'overdue', 'pending_verification', 'verified', 'closed']);
        $this->assertNoSnakeCase($body);
    }

    public function test_dashboard_stats_contract(): void
    {
        $token = $this->token('leader', 'Leader123!');
        [$res, $body] = $this->authGet('/api/dashboard', $token);
        $res->assertOk();

        foreach ([
            'taskTotal', 'taskCompleted', 'taskInProgress', 'taskNotStarted', 'taskOverdue',
            'completionRate', 'avgProgress', 'docPending', 'actionOverdue',
        ] as $k) {
            $this->assertArrayHasKey($k, $body);
        }
        foreach ([
            'tasksByStatus', 'tasksByPhase', 'tasksByPriority', 'docByStatus',
            'actionByStatus', 'overdueTasks', 'pendingDocs',
        ] as $k) {
            $this->assertArrayHasKey($k, $body);
            $this->assertIsArray($body[$k]);
        }
        $phase = collect($body['tasksByPhase'])->first();
        $this->assertEqualsCanonicalizing(
            ['phaseId', 'name', 'total', 'completed', 'avgProgress'],
            array_keys($phase)
        );
        $this->assertEqualsCanonicalizing(['status', 'count'], array_keys($body['tasksByStatus'][0]));
        $this->assertEqualsCanonicalizing(['priority', 'count'], array_keys($body['tasksByPriority'][0]));
        $this->assertNoSnakeCase($body);
    }

    public function test_admin_users_and_roles_contract(): void
    {
        $token = $this->token('admin', 'Admin123!');

        [$resU, $users] = $this->authGet('/api/admin/users', $token);
        $resU->assertOk();
        $this->assertNotEmpty($users);
        $u = $users[0];
        foreach (['id', 'username', 'fullName', 'departmentId', 'active', 'roleCodes', 'roleNames', 'lastLoginAt'] as $k) {
            $this->assertArrayHasKey($k, $u);
        }
        $this->assertArrayNotHasKey('password', $u);
        $this->assertArrayNotHasKey('remember_token', $u);
        $this->assertNoSnakeCase($users);

        [$resR, $roles] = $this->authGet('/api/admin/roles', $token);
        $resR->assertOk();
        $this->assertNotEmpty($roles);
        $r = $roles[0];
        $this->assertEqualsCanonicalizing(['id', 'code', 'name', 'description', 'permissions'], array_keys($r));
        $this->assertIsArray($r['permissions']);
        $this->assertNoSnakeCase($roles);
    }
}
