<?php

namespace App\Services;

use App\Models\MasterPlan;
use App\Models\MasterPlanDependency;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Auth\Access\AuthorizationException;

class MasterPlanService
{
    private const VALID_DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'];

    /**
     * Tự động số WBS theo thứ tự DFS (1, 1.1, 1.1.2...), tối đa 5 cấp.
     */
    public function calculateWbs(MasterPlan $plan, array $tasks): array
    {
        $map = [];
        foreach ($tasks as $t) {
            $map[$t->id] = $t;
        }

        $roots = array_values(array_filter($tasks, fn($t) => $t->parent_id === null));
        usort($roots, fn($a, $b) => $a->sort_order <=> $b->sort_order);

        $wbs = [];
        $this->assignWbs($map, $roots, '', 0, $wbs);

        foreach ($wbs as $id => $code) {
            $tasks[$id]->wbs = $code;
        }

        return $tasks;
    }

    private function assignWbs(array $map, array $nodes, string $prefix, int $depth, array &$wbs): void
    {
        if ($depth > 4) {
            return;
        }

        foreach ($nodes as $i => $node) {
            $code = $prefix ? $prefix.'.'.($i + 1) : (string)($i + 1);
            $wbs[$node->id] = $code;

            $children = array_values(array_filter($map, fn($t) => $t->parent_id === $node->id));
            usort($children, fn($a, $b) => $a->sort_order <=> $b->sort_order);
            $this->assignWbs($map, $children, $code, $depth + 1, $wbs);
        }
    }

    /**
     * Tiến độ → trạng thái suy ra (quy tắc CR Master Plan ISO):
     * - progress = 100 → completed (Hoàn thành)
     * - quá deadline (dueDate < hôm nay) và chưa hoàn thành → delayed (Trễ hạn)
     * - progress = 0 → not_started (Chưa thực hiện)
     * - còn lại (1..99) → in_progress (Đang thực hiện)
     *
     * Trạng thái do người dùng set tay chỉ giữ được với blocked/cancelled;
     * các trạng thái dẫn tiến độ được chuẩn hóa theo quy tắc trên.
     */
    public function deriveTaskStatus(int $progress, ?string $dueDate): string
    {
        if ($progress >= 100) {
            return 'completed';
        }

        $today = now()->format('Y-m-d');
        if ($dueDate && $dueDate < $today) {
            return 'delayed';
        }

        if ($progress <= 0) {
            return 'not_started';
        }

        return 'in_progress';
    }

    /**
     * Chuẩn hóa status sau khi biết progress + dueDate cuối cùng.
     * - blocked/cancelled: giữ nguyên (trạng thái thủ công).
     * - còn lại: suy ra từ tiến độ / deadline (xem deriveTaskStatus).
     */
    public function normalizeTaskStatus(?string $requested, int $progress, ?string $dueDate): string
    {
        if (in_array($requested, ['blocked', 'cancelled'], true)) {
            return $requested;
        }

        return $this->deriveTaskStatus($progress, $dueDate);
    }

    public function reorder(int $planId, array $orderedIds): void
    {
        $tasks = MasterPlanTask::where('master_plan_id', $planId)
            ->whereIn('id', $orderedIds)
            ->get();

        foreach ($tasks as $i => $t) {
            $t->sort_order = $i + 1;
            $t->save();
        }

        $this->rebuildWbs($planId);
    }

    public function rebuildWbs(int $planId): array
    {
        $plan = MasterPlan::find($planId);
        if (! $plan) {
            return [];
        }

        $tasks = $plan->tasks()->orderBy('sort_order')->get()->toArray();

        return $this->calculateWbs($plan, $tasks);
    }

    /**
     * Progress tổng (không double-count): trung bình có trọng số chỉ con đệ quy (leaf).
     */
    public function computeSummaryProgress(array $tasks): float
    {
        $leaf = array_values(array_filter($tasks, fn($t) => empty($t['children']) || !$t['children']));
        if (empty($leaf)) {
            return 0.0;
        }

        $total = array_reduce($leaf, fn($c, $t) => $c + max((int) ($t['duration'] ?? 0), 0), 0);
        if ($total <= 0) {
            return 0.0;
        }

        $sum = array_reduce($leaf, fn($c, $t) => $c + ((int) ($t['progress'] ?? 0) * max((int) ($t['duration'] ?? 0), 0)), 0);

        return round($sum / $total, 2);
    }

    /**
     * Status hiển thị: On Track / At Risk / Delayed / Completed.
     */
    public function computeStatus(MasterPlanTask $task, \DateTime $today): string
    {
        if ($task->status === 'completed') {
            return 'Completed';
        }

        if ($this->isDelayed($task, $today)) {
            return 'Delayed';
        }

        if ($this->isAtRisk($task, $today)) {
            return 'At Risk';
        }

        return 'On Track';
    }

    private function isDelayed(MasterPlanTask $task, \DateTime $today): bool
    {
        $todayStr = $today->format('Y-m-d');
        if ($task->actual_end_date && $task->actual_end_date < $todayStr) {
            return true;
        }

        if ($task->planned_end_date && $task->start_date
            && $task->planned_end_date < $todayStr && $task->start_date <= $todayStr) {
            return true;
        }

        return false;
    }

    private function isAtRisk(MasterPlanTask $task, \DateTime $today): bool
    {
        if (! $task->start_date) {
            return false;
        }

        if ($task->start_date > $today->format('Y-m-d')) {
            return false;
        }

        if (! $task->planned_end_date) {
            return false;
        }

        if ($task->planned_end_date < $today->format('Y-m-d')) {
            return false;
        }

        if ((int) ($task->progress ?? 0) >= 100) {
            return false;
        }

        return true;
    }

    public function topologicalSortForCycles(array $dependencies): array
    {
        $graph = $this->buildDependencyGraph($dependencies);
        $color = [];
        $order = [];
        $hasCycle = false;

        foreach ($graph as $node => $neighbors) {
            if ($color[$node] ?? 0) {
                continue;
            }

            $this->visitTopo($graph, $color, $node, $order, $hasCycle);
            if ($hasCycle) {
                break;
            }
        }

        if ($hasCycle) {
            throw new \InvalidArgumentException('Không thể lưu: tồn tại chuTrình phụ thuộc giữa các công việc.');
        }

        return array_reverse($order);
    }

    private function buildDependencyGraph(array $dependencies): array
    {
        $graph = [];
        foreach ($dependencies as $d) {
            $from = $d['predecessor_task_id'];
            $to = $d['successor_task_id'];
            if (! isset($graph[$from])) {
                $graph[$from] = [];
            }
            if (! in_array($to, $graph[$from], true)) {
                $graph[$from][] = $to;
            }
            if (! isset($graph[$to])) {
                $graph[$to] = [];
            }
        }

        return $graph;
    }

    private function visitTopo(array $graph, array &$color, int $node, array &$order, bool &$hasCycle): void
    {
        $color[$node] = 1;

        foreach ($graph[$node] ?? [] as $v) {
            $c = $color[$v] ?? 0;
            if ($c === 1) {
                $hasCycle = true;
                return;
            }

            if ($c === 0) {
                $this->visitTopo($graph, $color, $v, $order, $hasCycle);
            }

            if ($hasCycle) {
                return;
            }
        }

        $color[$node] = 2;
        $order[] = $node;
    }

    public function validDependencyTypes(): array
    {
        return self::VALID_DEPENDENCY_TYPES;
    }


    public function validateDate(?string $startDate, ?string $endDate, ?string $dependencyStart, ?string $dependencyType): array
    {
        $errors = [];

        if ($startDate && $endDate && $startDate > $endDate) {
            $errors[] = 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.';
        }

        if ($dependencyType && $dependencyStart && $endDate && $dependencyType === 'FS') {
            if ($dependencyStart > $endDate) {
                $errors[] = 'FS: kết thúc phải >= bắt đầu của công việc gây phụ thuộc.';
            }
        }

        return $errors;
    }

    public function validateDependency(int $masterPlanId, int $predecessorId, int $successorId, string $dependencyType, array $existing = []): array
    {
        $errors = [];

        if ($predecessorId === $successorId) {
            $errors[] = 'Không được tự phụ thuộc.';
        }

        foreach ($existing as $d) {
            if ($d['predecessor_task_id'] === $predecessorId
                && $d['successor_task_id'] === $successorId
                && $d['dependency_type'] === $dependencyType) {
                $errors[] = 'Phụ thuộc trùng lặp.';
                break;
            }
        }

        if (! $errors && $this->hasCircularDependency($masterPlanId, $predecessorId, $successorId)) {
            $errors[] = 'Phụ thuộc tạo ra chuTrình.';
        }

        return $errors;
    }

    private function hasCircularDependency(int $masterPlanId, int $fromId, int $toId): bool
    {
        $graph = [];
        foreach (MasterPlanDependency::where('master_plan_id', $masterPlanId)->get()->toArray() as $r) {
            $graph[$r['predecessor_task_id']][] = $r['successor_task_id'];
        }

        $visited = [];
        $stack = [$toId];

        while (! empty($stack)) {
            $node = array_pop($stack);
            if (isset($visited[$node])) {
                continue;
            }
            $visited[$node] = true;

            if (! isset($graph[$node])) {
                continue;
            }

            foreach ($graph[$node] as $nxt) {
                if ($nxt === $fromId) {
                    return true;
                }
                $stack[] = $nxt;
            }
        }

        return false;
    }

    public function createTask(int $planId, array $data, ?Authenticatable $actor): MasterPlanTask
    {
        $parent = isset($data['parent_id']) ? MasterPlanTask::find($data['parent_id']) : null;
        if ($parent) {
            $depth = 1;
            $cur = $parent;
            while ($cur->parent_id) {
                $depth++;
                $cur = $cur->parent;
                if ($depth > 5) {
                    throw new \InvalidArgumentException('Chá»‰ há»— trá»£ tá»‘i Ä‘a 5 cáº¥p cÃ´ng viá»‡c con.');
                }
            }
        }

        $start = $data['start_date'] ?? null;
        $end = $data['due_date'] ?? null;
        $duration = null;
        if ($start && $end) {
            $s = strtotime($start);
            $e = strtotime($end);
            if ($s && $e) {
                $duration = max(1, (int) round(($e - $s) / 86400) + 1);
            }
        }

        $task = MasterPlanTask::create([
            'master_plan_id' => $planId,
            'phase_id' => $data['phase_id'],
            'parent_id' => $data['parent_id'] ?? null,
            'sort_order' => (int) MasterPlanTask::where('master_plan_id', $planId)
                ->where('parent_id', $data['parent_id'] ?? null)
                ->max('sort_order') + 1,
            'code' => $data['code'],
            'name' => $data['name'],
            'owner_id' => $data['owner_id'] ?? null,
            'department_id' => $data['department_id'] ?? null,
            'priority' => $data['priority'] ?? 'medium',
            'status' => 'not_started',
            'progress' => (int) ($data['progress'] ?? 0),
            'start_date' => $data['start_date'],
            'due_date' => $data['due_date'],
            'duration' => $duration,
            'planned_start_date' => $data['planned_start_date'] ?? null,
            'planned_end_date' => $data['planned_end_date'] ?? null,
            'actual_start_date' => $data['actual_start_date'] ?? null,
            'actual_end_date' => $data['actual_end_date'] ?? null,
            'constraint_type' => $data['constraint_type'] ?? null,
            'constraint_date' => $data['constraint_date'] ?? null,
            'baseline_start_date' => $data['baseline_start_date'] ?? null,
            'baseline_end_date' => $data['baseline_end_date'] ?? null,
            'baseline_progress' => $data['baseline_progress'] ?? null,
            'is_milestone' => (bool) ($data['is_milestone'] ?? false),
        ]);

        return $task;
    }

    public function updateTask(MasterPlanTask $task, array $data, ?Authenticatable $actor): void
    {
        if (array_key_exists('owner_id', $data) && ! $this->can($actor, 'master_plan.assign')) {
            throw new AuthorizationException('Báº¡n khÃ´ng cÃ³ quyá»n giao viá»‡c.');
        }

        $allowed = [
            'code', 'name', 'phase_id', 'parent_id', 'priority', 'status', 'progress',
            'start_date', 'due_date', 'is_milestone', 'planned_start_date', 'planned_end_date',
            'actual_start_date', 'actual_end_date', 'duration', 'constraint_type', 'constraint_date',
            'baseline_start_date', 'baseline_end_date', 'baseline_progress',
        ];

        foreach ($allowed as $field) {
            if (array_key_exists($field, $data)) {
                $task->{$field} = $data[$field];
            }
        }

        if ($task->status === 'completed') {
            $task->progress = 100;
        }

        $task->save();
    }


    public function hasLevelTasks(int $planId, int $level): bool
    {
        $sql = "WITH RECURSIVE tree AS (
            SELECT id, parent_id, 0 AS lvl FROM master_plan_tasks WHERE master_plan_id = ? AND parent_id IS NULL
            UNION ALL
            SELECT t.id, t.parent_id, tree.lvl + 1 FROM master_plan_tasks t JOIN tree ON t.parent_id = tree.id
        ) SELECT COUNT(*) FROM tree WHERE lvl = ?";
        $count = MasterPlanTask::selectRaw($sql, [$planId, $level])->value();

        return (bool) $count;
    }

    public function validateReorderOrder(int $planId, array $orderedIds): void
    {
        $tasks = MasterPlanTask::where('master_plan_id', $planId)->get()->keyBy('id');

        if ($tasks->count() !== count($orderedIds)) {
            throw new \InvalidArgumentException('Số lượng công việc không khớp.');
        }

        if (count(array_unique($orderedIds)) !== count($orderedIds)) {
            throw new \InvalidArgumentException('Thứ tự trùng lặp.');
        }

        foreach ($orderedIds as $id) {
            if (! $tasks->has($id)) {
                throw new \InvalidArgumentException('Công việc không tồn tại.');
            }
        }

        foreach ($orderedIds as $i => $id) {
            $node = $tasks->get($id);
            $descendants = $this->descendantIds($tasks, $id);

            foreach ($descendants as $d) {
                $j = array_search($d, $orderedIds, true);
                if ($j !== false && $j < $i) {
                    throw new \InvalidArgumentException('Thứ tự không phải DFS gốc hợp lệ.');
                }
            }
        }
    }

    private function descendantIds($tasks, int $id): array
    {
        $ids = [];
        foreach ($tasks as $t) {
            if ($t['parent_id'] == $id) {
                $ids[] = $t['id'];
                $ids = array_merge($ids, $this->descendantIds($tasks, $t['id']));
            }
        }

        return $ids;
    }

    /** Lấy cây task có WBS + status + dependency counts (cấu hình FE). */
    public function fetchWithTree(int $planId, array $params = []): array
    {
        $plan = MasterPlan::find($planId);
        if (! $plan) {
            return [];
        }

        $query = $plan->tasks()
            ->with(['children' => fn($q) => $q->orderBy('sort_order'), 'owner', 'department'])
            ->withCount(['predecessors', 'successors'])
            ->orderBy('sort_order');

        $tasks = $query->get()->toArray();

        $today = new \DateTime();
        foreach ($tasks as &$t) {
            $t['wbs'] = '';
            $t['resource_status'] = 'On Track';
            $t['dependent_count'] = (int) ($t['predecessors_count'] ?? 0);
            $t['successor_count'] = (int) ($t['successors_count'] ?? 0);
            $t['owner_name'] = $t['owner'] ? ($t['owner']['full_name'] ?? null) : null;
        }

        $tasks = $this->calculateWbs($plan, $tasks);

        foreach ($tasks as &$t) {
            $t['resource_status'] = $this->computeStatus((object) $t, $today);
            $t['level'] = $this->wbsLevel($t['wbs'] ?? '');
        }

        return $tasks;
    }


    public function daysBetween(?string $start, ?string $end): ?int
    {
        if (! $start || ! $end) {
            return null;
        }

        $s = strtotime($start);
        $e = strtotime($end);
        if (! $s || ! $e) {
            return null;
        }

        return max(0, (int) round(($e - $s) / 86400));
    }

    private function wbsLevel(string $wbs): int
    {
        if ($wbs === '') {
            return 0;
        }

        return substr_count($wbs, '.') + 1;
    }

    private function barOf(array $t, array $scale): ?array
    {
        if (! $t['start_date'] || ! $t['due_date']) {
            return null;
        }

        $s = strtotime($t['start_date']);
        $e = strtotime($t['due_date']);
        if (! $s || ! $e) {
            return null;
        }

        $total = $scale['max'] - $scale['min'];
        if ($total <= 0) {
            return null;
        }

        $left = max(0, min(($s - $scale['min']) / $total * 100, 99.5));
        $right = max($left + 0.5, min(($e - $scale['min']) / $total * 100, 100));

        return ['left' => round($left, 2), 'width' => round($right - $left, 2)];
    }

    public function buildGanttScale(array $tasks, \DateTime $today, string $min = null, string $max = null): array
    {
        $lo = $min ?? $today->format('Y-m-d');
        $hi = $max ?? $today->format('Y-m-d');

        foreach ($tasks as $t) {
            if ($t['start_date'] && $t['start_date'] < $lo) {
                $lo = $t['start_date'];
            }
            if ($t['due_date'] && $t['due_date'] > $hi) {
                $hi = $t['due_date'];
            }
        }

        return ['min' => $lo, 'max' => $hi, 'today' => $today->format('Y-m-d')];
    }

    public function buildGanttRows(array $tasks, \DateTime $today, int $level = 0): array
    {
        $scale = $this->buildGanttScale($tasks, $today);
        $rows = [];

        foreach ($tasks as $t) {
            if ($level > 0 && (int) ($t['level'] ?? 0) !== $level) {
                continue;
            }

            $bar = $this->barOf($t, $scale);
            $rows[] = [
                'id' => $t['id'],
                'wbs' => $t['wbs'],
                'name' => $t['name'],
                'start' => $t['start_date'],
                'end' => $t['due_date'],
                'duration' => $t['duration'] ?? $this->daysBetween($t['start_date'] ?? null, $t['due_date'] ?? null),
                'progress' => (int) ($t['progress'] ?? 0),
                'status' => $t['status'],
                'resource_status' => $t['resource_status'],
                'is_milestone' => (bool) ($t['is_milestone'] ?? false),
                'assignee_id' => $t['owner_id'],
                'assignee_name' => $t['owner_name'] ?? null,
                'bar' => $bar,
            ];
        }

        return $rows;
    }

}

