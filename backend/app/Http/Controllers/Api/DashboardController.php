<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\DocumentResource;
use App\Http\Resources\TaskResource;
use App\Models\Action;
use App\Models\Document;
use App\Models\MasterPlanPhase;
use App\Models\MasterPlanTask;
use App\Support\Helpers;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function __invoke(): JsonResponse
    {
        // Eager-load để Resource render đầy đủ relations
        // (pendingDocs cần versions[]/approvals[] để không bị rỗng).
        $tasks = MasterPlanTask::all();
        $documents = Document::with(['versions', 'approvals'])->get();
        $actions = Action::all();

        $overdueTasks = collect(Helpers::overdue($tasks, 'due_date', 'status'))
            ->sortBy('due_date')
            ->values();
        $pendingDocs = $documents->whereIn('status', ['review_pending', 'reviewing', 'approval_pending'])->values();

        // ĐẦY ĐỦ mọi trạng thái (kể cả count=0), đúng thứ tự FE dùng để vẽ chart.
        $docByStatus = Helpers::countByStatuses($documents, 'status', [
            'planned', 'draft', 'review_pending', 'reviewing', 'approval_pending', 'approved', 'published', 'obsolete', 'archived',
        ]);
        $actionByStatus = Helpers::countByStatuses($actions, 'status', [
            'open', 'in_progress', 'blocked', 'overdue', 'pending_verification', 'verified', 'closed',
        ]);

        return response()->json([
            'taskTotal' => $tasks->count(),
            'taskCompleted' => $tasks->where('status', 'completed')->count(),
            'taskInProgress' => $tasks->where('status', 'in_progress')->count(),
            'taskNotStarted' => $tasks->where('status', 'not_started')->count(),
            'taskOverdue' => $overdueTasks->count(),
            'completionRate' => Helpers::completionRate($tasks),
            'avgProgress' => Helpers::avgProgress($tasks),
            'tasksByStatus' => Helpers::countByStatuses($tasks, 'status', [
                'not_started', 'in_progress', 'blocked', 'delayed', 'completed', 'cancelled',
            ]),
            'tasksByPhase' => $this->tasksByPhase($tasks),
            'tasksByPriority' => $this->tasksByPriority($tasks),
            'docByStatus' => $docByStatus,
            'docPending' => $this->countOf($docByStatus, ['review_pending', 'approval_pending']),
            'actionByStatus' => $actionByStatus,
            'actionOverdue' => $this->actionOverdue($actions),
            'overdueTasks' => TaskResource::collection($overdueTasks->take(8)),
            'pendingDocs' => DocumentResource::collection($pendingDocs),
        ]);
    }

    /**
     * Action quá hạn – khớp logic FE: status='overdue' HOẶC (dueDate < hôm nay
     * và status chưa đóng/chưa xác minh).
     */
    private function actionOverdue($actions): int
    {
        $today = now()->format('Y-m-d');

        return $actions->filter(function ($a) use ($today) {
            return $a->status === 'overdue'
                || ($a->due_date && $a->due_date->format('Y-m-d') < $today
                    && ! in_array($a->status, ['closed', 'verified'], true));
        })->count();
    }

    /**
     * Thống kê task theo từng giai đoạn (mảng {phaseId,name,total,completed,avgProgress}).
     */
    private function tasksByPhase($tasks): array
    {
        $result = [];
        $phases = MasterPlanPhase::orderBy('sort_order')->select('id', 'name')->get();
        foreach ($phases as $phase) {
            $phaseTasks = $tasks->where('phase_id', $phase->id);
            $result[] = [
                'phaseId' => $phase->id,
                'name' => $phase->name,
                'total' => $phaseTasks->count(),
                'completed' => $phaseTasks->where('status', 'completed')->count(),
                'avgProgress' => $phaseTasks->isEmpty() ? 0 : (int) round($phaseTasks->avg('progress')),
            ];
        }

        return $result;
    }

    /**
     * Thống kê task theo mức ưu tiên (mảng {priority,count}).
     */
    private function tasksByPriority($tasks): array
    {
        $result = [];
        foreach (['critical', 'high', 'medium', 'low'] as $priority) {
            $result[] = [
                'priority' => $priority,
                'count' => $tasks->where('priority', $priority)->count(),
            ];
        }

        return $result;
    }

    /** Cộng count của các status nằm trong $statuses từ mảng countByStatus. */
    private function countOf(array $byStatus, array $statuses): int
    {
        $sum = 0;
        foreach ($byStatus as $row) {
            if (in_array($row['status'], $statuses, true)) {
                $sum += $row['count'];
            }
        }

        return $sum;
    }
}
