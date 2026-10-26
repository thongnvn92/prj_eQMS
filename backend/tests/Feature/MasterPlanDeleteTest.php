<?php

namespace Tests\Feature;

use App\Models\MasterPlan;
use App\Models\MasterPlanDependency;
use App\Models\MasterPlanPhase;
use App\Models\MasterPlanTask;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * DELETE /api/master-plan/plans/{id} – xóa kế hoạch + toàn bộ dữ liệu liên quan:
 * dependencies → tasks → phases → plan (1 transaction, có activity log).
 */
class MasterPlanDeleteTest extends TestCase
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

    public function test_delete_plan_cascades_phases_tasks_and_dependencies(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!'); // iso_leader: master_plan.delete

            $plan = MasterPlan::create([
                'code' => 'TX-DEL-'.uniqid(),
                'name' => 'Kế hoạch kiểm thử xóa',
                'cycle_label' => 'T10/2026',
                'start_date' => '2026-10-01',
                'end_date' => '2027-10-01',
                'status' => 'not_started',
            ]);
            $phase = MasterPlanPhase::create([
                'master_plan_id' => $plan->id,
                'code' => 'P1',
                'name' => 'Giai đoạn 1',
                'start_date' => '2026-10-01',
                'end_date' => '2027-01-01',
                'sort_order' => 1,
            ]);
            $t1 = MasterPlanTask::create([
                'phase_id' => $phase->id, 'code' => 'DEL-001', 'name' => 'Task cha',
                'priority' => 'high', 'status' => 'not_started', 'progress' => 0,
                'start_date' => '2026-10-01', 'due_date' => '2026-11-01',
            ]);
            $t2 = MasterPlanTask::create([
                'phase_id' => $phase->id, 'parent_id' => $t1->id, 'code' => 'DEL-002', 'name' => 'Task con',
                'priority' => 'medium', 'status' => 'not_started', 'progress' => 0,
                'start_date' => '2026-10-01', 'due_date' => '2026-11-05',
            ]);
            MasterPlanDependency::create([
                'master_plan_id' => $plan->id,
                'predecessor_task_id' => $t1->id,
                'successor_task_id' => $t2->id,
                'dependency_type' => 'FS',
            ]);

            $response = $this->withHeaders($headers)->deleteJson("/api/master-plan/plans/{$plan->id}");

            $response->assertOk()->assertJsonPath('status', 'ok');
            $this->assertSame(0, MasterPlan::where('id', $plan->id)->count());
            $this->assertSame(0, MasterPlanPhase::where('master_plan_id', $plan->id)->count());
            $this->assertSame(0, MasterPlanTask::whereIn('id', [$t1->id, $t2->id])->count());
            $this->assertSame(0, MasterPlanDependency::where('master_plan_id', $plan->id)->count());
            $this->assertDatabaseHas('activity_logs', [
                'action' => 'delete',
                'entity' => 'master_plan',
                'entity_id' => $plan->id,
            ]);
        });
    }

    public function test_delete_plan_without_permission_403(): void
    {
        $this->tx(function () {
            // coordinator chỉ có master_plan.view → 403 (route middleware).
            $headers = $this->authAs('coordinator', 'Coord123!');

            $this->withHeaders($headers)
                ->deleteJson('/api/master-plan/plans/1')
                ->assertStatus(403);
        });
    }

    public function test_delete_plan_not_found_404(): void
    {
        $this->tx(function () {
            $headers = $this->authAs('leader', 'Leader123!');

            $this->withHeaders($headers)
                ->deleteJson('/api/master-plan/plans/999999')
                ->assertStatus(404);
        });
    }
}