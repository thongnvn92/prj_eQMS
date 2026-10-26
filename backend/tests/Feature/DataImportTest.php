<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Import hàng loạt (bulk) – POST /master-plan/tasks/import & POST /documents/import:
 * 1 request → pre-load id → validate từng dòng thuần PHP → insert bulk (partial import).
 * Bọc transaction + rollback – không làm bẩn DB dev.
 */
class DataImportTest extends TestCase
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

    private function taskRow(array $override = []): array
    {
        return array_merge([
            'phaseId' => DB::table('master_plan_phases')->value('id'),
            'code' => 'IMP-T'.random_int(100, 999),
            'name' => 'Công việc import',
            'startDate' => '2026-11-01',
            'dueDate' => '2026-11-30',
        ], $override);
    }

    public function test_import_tasks_requires_auth(): void
    {
        $this->postJson('/api/master-plan/tasks/import', ['rows' => [$this->taskRow()]])->assertStatus(401);
    }

    public function test_import_tasks_requires_master_plan_create_permission(): void
    {
        $headers = $this->authAs('user', 'User123!');
        $this->withHeaders($headers)->postJson('/api/master-plan/tasks/import', ['rows' => [$this->taskRow()]])
            ->assertStatus(403);
    }

    public function test_import_tasks_rejects_empty_rows(): void
    {
        $headers = $this->authAs('admin', 'Admin123!');
        $this->withHeaders($headers)->postJson('/api/master-plan/tasks/import', ['rows' => []])->assertStatus(422);
    }

    public function test_import_tasks_partial_import_reports_row_errors(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');
            $before = (int) DB::table('master_plan_tasks')->count();
            $logsBefore = (int) DB::table('activity_logs')->count();

            $response = $this->withHeaders($headers)->postJson('/api/master-plan/tasks/import', [
                'rows' => [
                    ['line' => 2] + $this->taskRow(['code' => 'IMP-OK1']),
                    ['line' => 3] + $this->taskRow(['code' => 'IMP-OK2', 'priority' => 'high']),
                    ['line' => 4] + $this->taskRow(['phaseId' => 999999, 'code' => 'IMP-BAD']),
                ],
            ])->assertOk();

            $response->assertJsonPath('imported', 2);
            $errors = $response->json('errors');
            $this->assertCount(1, $errors);
            $this->assertSame(2, $errors[0]['index']);
            $this->assertSame(4, $errors[0]['line']);
            $this->assertSame('phaseId không tồn tại.', $errors[0]['message']);

            $this->assertSame($before + 2, DB::table('master_plan_tasks')->count());
            $this->assertSame(1, DB::table('master_plan_tasks')->where('code', 'IMP-OK1')->count());
            $this->assertSame(0, DB::table('master_plan_tasks')->where('code', 'IMP-BAD')->count());
            $task = DB::table('master_plan_tasks')->where('code', 'IMP-OK1')->first();
            $this->assertSame('not_started', $task->status);
            $this->assertSame('medium', $task->priority);
            $this->assertSame(0, (int) $task->progress);
            // activity log hàng loạt: đủ cho 2 task import
            $this->assertSame($logsBefore + 2, (int) DB::table('activity_logs')->count());
        });
    }

    public function test_import_tasks_validates_each_row(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');

            $response = $this->withHeaders($headers)->postJson('/api/master-plan/tasks/import', [
                'rows' => [
                    $this->taskRow(['startDate' => '01/11/2026']),
                    $this->taskRow(['dueDate' => '2026-10-01']),
                    $this->taskRow(['priority' => 'urgent']),
                ],
            ])->assertOk();

            $response->assertJsonPath('imported', 0);
            $this->assertSame([
                'startDate phải dạng yyyy-mm-dd.',
                'dueDate nhỏ hơn startDate.',
                'priority phải là critical|high|medium|low.',
            ], array_column($response->json('errors'), 'message'));
        });
    }

    public function test_import_documents_partial_import_with_defaults_and_versions(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');
            $adminId = (int) DB::table('users')->where('username', 'admin')->value('id');
            $existingCode = (string) DB::table('documents')->value('code');
            $logsBefore = (int) DB::table('activity_logs')->count();

            $response = $this->withHeaders($headers)->postJson('/api/documents/import', [
                'rows' => [
                    ['line' => 2, 'code' => 'IMP-D1', 'name' => 'Tài liệu import 1', 'docType' => 'procedure'],
                    ['line' => 3, 'code' => 'IMP-D1', 'name' => 'Trùng trong file', 'docType' => 'procedure'],
                    ['line' => 4, 'code' => $existingCode, 'name' => 'Trùng trong DB', 'docType' => 'policy'],
                    ['line' => 5, 'code' => 'IMP-D2', 'name' => 'Tài liệu import 2', 'docType' => 'policy'],
                ],
            ])->assertOk();

            $response->assertJsonPath('imported', 2);
            $errors = $response->json('errors');
            $this->assertCount(2, $errors);
            $this->assertSame(1, $errors[0]['index']); // dup trong file (dòng 3)
            $this->assertSame(3, $errors[0]['line']);
            $this->assertSame(2, $errors[1]['index']); // trùng mã trong DB (dòng 4)

            $doc = DB::table('documents')->where('code', 'IMP-D1')->first();
            $this->assertNotNull($doc);
            $this->assertSame('planned', $doc->status);
            $this->assertSame('V0.1', $doc->current_version);
            $this->assertSame(1, (int) $doc->workflow_step);
            $this->assertSame($adminId, (int) $doc->owner_id); // fallback owner = người tạo
            $version = DB::table('document_versions')->where('document_id', $doc->id)->first();
            $this->assertNotNull($version);
            $this->assertSame('V0.1', $version->version);
            $this->assertEquals(1, (int) $version->is_current);
            // activity log hàng loạt: đủ cho 2 document import
            $this->assertSame($logsBefore + 2, (int) DB::table('activity_logs')->count());
        });
    }

    public function test_import_documents_validates_rows(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('admin', 'Admin123!');
            $response = $this->withHeaders($headers)->postJson('/api/documents/import', [
                'rows' => [
                    ['code' => 'IMP-X1', 'name' => '', 'docType' => 'procedure'],
                    ['code' => 'IMP-X2', 'name' => 'X', 'docType' => 'email'],
                ],
            ])->assertOk();

            $response->assertJsonPath('imported', 0);
            $this->assertSame(
                ['Thiếu name.', 'docType không hợp lệ.'],
                array_column($response->json('errors'), 'message'),
            );
        });
    }

    /** Test riêng (1 user/method) để guard sanctum không cache user từ request trước. */
    public function test_import_documents_requires_document_create_permission(): void
    {
        $user = $this->authAs('user', 'User123!');
        $this->withHeaders($user)->postJson('/api/documents/import', [
            'rows' => [['code' => 'IMP-403', 'name' => 'X', 'docType' => 'procedure']],
        ])->assertStatus(403);
    }
}