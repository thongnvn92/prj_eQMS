<?php

namespace Tests\Feature;

use App\Models\Action;
use App\Models\Document;
use App\Models\MasterPlanPhase;
use App\Models\MasterPlanTask;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Task 06 – Dashboard aggregation test:
 * Đối chiếu TỪNG chỉ số của GET /api/dashboard với dữ liệu DB thật
 * (tính trực tiếp từ model – không hardcode số, độc lập lần chạy trước).
 * Bọc transaction + rollback như test Task 03 (không làm bẩn dữ liệu dev).
 */
class DashboardAggregationTest extends TestCase
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

    public function test_dashboard_counts_match_database(): void
    {
        $headers = $this->authAs('leader', 'Leader123!');

        $response = $this->withHeaders($headers)->getJson('/api/dashboard');
        $response->assertOk();
        $json = $response->json();

        // ---- Task totals – tính trực tiếp từ DB ----
        $tasks = MasterPlanTask::all();
        $this->assertSame($tasks->count(), $json['taskTotal'], 'taskTotal');
        $this->assertSame($tasks->where('status', 'completed')->count(), $json['taskCompleted'], 'taskCompleted');
        $this->assertSame($tasks->where('status', 'in_progress')->count(), $json['taskInProgress'], 'taskInProgress');
        $this->assertSame($tasks->where('status', 'not_started')->count(), $json['taskNotStarted'], 'taskNotStarted');

        // completionRate = round(completed / total * 100).
        $expectedRate = $tasks->isEmpty()
            ? 0
            : (int) round($tasks->where('status', 'completed')->count() / $tasks->count() * 100);
        $this->assertSame($expectedRate, (int) $json['completionRate'], 'completionRate');

        // avgProgress = round(avg(progress)).
        $expectedAvg = $tasks->isEmpty() ? 0 : (int) round($tasks->avg('progress'));
        $this->assertSame($expectedAvg, (int) $json['avgProgress'], 'avgProgress');

        // ---- tasksByStatus: đủ 6 status đúng thứ tự contract, từng count == DB ----
        $byStatus = collect($json['tasksByStatus']);
        $this->assertSame(
            ['not_started', 'in_progress', 'blocked', 'delayed', 'completed', 'cancelled'],
            $byStatus->pluck('status')->all(),
            'tasksByStatus order',
        );
        foreach ($byStatus as $row) {
            $this->assertSame(
                $tasks->where('status', $row['status'])->count(),
                (int) $row['count'],
                "tasksByStatus[{$row['status']}]",
            );
        }
        $this->assertSame($json['taskTotal'], (int) $byStatus->sum('count'), 'sum(tasksByStatus) == taskTotal');

        // ---- tasksByPriority: đủ 4 mức, tổng == taskTotal ----
        $byPriority = collect($json['tasksByPriority']);
        $this->assertSame(['critical', 'high', 'medium', 'low'], $byPriority->pluck('priority')->all());
        foreach ($byPriority as $row) {
            $this->assertSame(
                $tasks->where('priority', $row['priority'])->count(),
                (int) $row['count'],
                "tasksByPriority[{$row['priority']}]",
            );
        }
        $this->assertSame($json['taskTotal'], (int) $byPriority->sum('count'), 'sum(tasksByPriority) == taskTotal');

        // ---- tasksByPhase: đủ mọi phase (sort_order), tổng total == taskTotal ----
        $phases = MasterPlanPhase::orderBy('sort_order')->get();
        $byPhase = collect($json['tasksByPhase']);
        $this->assertSame($phases->count(), $byPhase->count(), 'tasksByPhase count');
        $this->assertSame($json['taskTotal'], (int) $byPhase->sum('total'), 'sum(tasksByPhase.total) == taskTotal');
        foreach ($byPhase as $row) {
            $phaseTasks = $tasks->where('phase_id', $row['phaseId']);
            $this->assertSame($phaseTasks->count(), (int) $row['total'], "tasksByPhase[{$row['phaseId']}].total");
            $this->assertSame(
                $phaseTasks->where('status', 'completed')->count(),
                (int) $row['completed'],
                "tasksByPhase[{$row['phaseId']}].completed",
            );
        }

        // ---- Documents ----
        $docs = Document::all();
        $docByStatus = collect($json['docByStatus']);
        $this->assertSame($docs->count(), (int) $docByStatus->sum('count'), 'sum(docByStatus) == doc count');
        $this->assertSame(
            $docs->where('status', 'approval_pending')->count(),
            (int) $json['docPending'],
            'docPending',
        );

        // ---- Actions ----
        $actions = Action::all();
        $actionByStatus = collect($json['actionByStatus']);
        $this->assertSame($actions->count(), (int) $actionByStatus->sum('count'), 'sum(actionByStatus) == action count');

        // actionOverdue = status 'overdue' HOẶC (quá hạn mà chưa closed/verified).
        $today = now()->format('Y-m-d');
        $expectedActionOverdue = $actions->filter(function ($a) use ($today) {
            $due = $a->due_date ? Carbon::parse($a->due_date)->format('Y-m-d') : null;

            return $a->status === 'overdue'
                || ($due !== null && $due < $today && ! in_array($a->status, ['closed', 'verified'], true));
        })->count();
        $this->assertSame($expectedActionOverdue, (int) $json['actionOverdue'], 'actionOverdue');

        // ---- taskOverdue + overdueTasks: nhất quán, tối đa 8, đúng tập DB ----
        $expectedOverdueTasks = $tasks->filter(function ($t) use ($today) {
            $due = $t->due_date ? Carbon::parse($t->due_date)->format('Y-m-d') : null;

            return $due !== null
                && $due < $today
                && $t->status !== 'completed'
                && $t->status !== 'cancelled';
        });
        $this->assertSame($expectedOverdueTasks->count(), (int) $json['taskOverdue'], 'taskOverdue');

        $overdueList = collect($json['overdueTasks']);
        $this->assertLessThanOrEqual(8, $overdueList->count(), 'overdueTasks tối đa 8');
        $this->assertSame(min(8, $expectedOverdueTasks->count()), $overdueList->count(), 'overdueTasks count');
        $expectedIds = $expectedOverdueTasks->pluck('id')->all();
        foreach ($overdueList as $t) {
            $this->assertContains($t['id'], $expectedIds, 'overdueTasks chứa id có thật trong tập quá hạn');
            $this->assertNotContains($t['status'], ['completed', 'cancelled'], 'overdueTasks không chứa task đã đóng');
        }

        // ---- pendingDocs: chỉ reviewing / approval_pending ----
        foreach ($json['pendingDocs'] as $doc) {
            $this->assertContains($doc['status'], ['reviewing', 'approval_pending'], 'pendingDocs status');
        }
    }

    public function test_dashboard_returns_401_without_token(): void
    {
        $response = $this->withHeaders(['Accept' => 'application/json'])->getJson('/api/dashboard');

        $response->assertStatus(401);
        $response->assertJson(['status' => 'error']);
    }

    public function test_dashboard_returns_403_for_user_without_dashboard_permission(): void
    {
        $this->tx(function () {
            // Tạo user không có role nào (mới) → không có dashboard.view → 403.
            $user = User::create([
                'username' => 'norole_'.uniqid(),
                'full_name' => 'Test No Role',
                'email' => uniqid().'@test.local',
                'password' => 'Secret123!',
                'is_active' => true,
            ]);

            $login = $this->postJson('/api/login', [
                'username' => $user->username,
                'password' => 'Secret123!',
            ]);
            $login->assertOk();

            $headers = [
                'Authorization' => 'Bearer '.$login->json('token'),
                'Accept' => 'application/json',
            ];

            $this->withHeaders($headers)->getJson('/api/dashboard')->assertStatus(403);
        });
    }
}
