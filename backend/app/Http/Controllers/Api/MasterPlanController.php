<?php

namespace App\Http\Controllers\Api;

use App\Enums\LogEntity;
use App\Http\Controllers\Controller;
use App\Http\Resources\MasterPlanResource;
use App\Http\Resources\PhaseResource;
use App\Http\Resources\TaskResource;
use App\Models\ActivityLog;
use App\Models\MasterPlan;
use App\Models\MasterPlanPhase;
use App\Models\MasterPlanTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class MasterPlanController extends Controller
{
    /**
     * GET /master-plan – trả plans[] (nhiều kế hoạch), phases[], tasks[] để khớp contract FE.
     * tasks[] trả PHẲNG (task gốc + sub-task) kèm parentId để FE tự dựng cây (flattenVisibleTree).
     */
    public function __invoke(Request $request): JsonResponse
    {
        $plans = MasterPlan::orderBy('start_date')->get();
        $phases = MasterPlanPhase::orderBy('sort_order')->get();
        // Trả phẳng gốc + con (kèm parentId): FE tự dựng cây phân cấp.
        $tasks = MasterPlanTask::orderBy('sort_order')
            ->orderBy('code')
            ->get();

        return response()->json([
            'plans' => MasterPlanResource::collection($plans),
            'phases' => PhaseResource::collection($phases),
            'tasks' => TaskResource::collection($tasks),
        ]);
    }

    // ===================== PLAN CRUD =====================

    /** GET /master-plan/plans – danh sách kế hoạch. */
    public function plans(): JsonResponse
    {
        return response()->json(MasterPlanResource::collection(MasterPlan::orderBy('start_date')->get()));
    }

    /** POST /master-plan/plans – tạo kế hoạch mới (quyền master_plan.create). */
    public function storePlan(Request $request): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        if (! $actor) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $data = $request->validate([
            'code' => ['required', 'string', 'max:30', 'unique:master_plans,code'],
            'name' => ['required', 'string', 'max:200'],
            'cycleLabel' => ['required', 'string', 'max:50'],
            'startDate' => ['required', 'date'],
            'endDate' => ['required', 'date', 'after_or_equal:startDate'],
            'description' => ['nullable', 'string'],
        ]);

        $plan = MasterPlan::create([
            'code' => $data['code'],
            'name' => $data['name'],
            'cycle_label' => $data['cycleLabel'],
            'start_date' => $data['startDate'],
            'end_date' => $data['endDate'],
            'status' => 'not_started',
            'description' => $data['description'] ?? null,
            'created_by' => $actor->id,
        ]);

        ActivityLog::create([
            'user_id' => $actor->id,
            'action' => 'create',
            'entity' => 'master_plan',
            'entity_id' => $plan->id,
        ]);

        return response()->json(new MasterPlanResource($plan), 201);
    }

    /** PATCH /master-plan/plans/{id} – sửa kế hoạch (quyền master_plan.update). */
    public function updatePlan(Request $request, int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        if (! $actor) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $plan = MasterPlan::find($id);
        if (! $plan) {
            return $this->error('Không tìm thấy kế hoạch.', 404);
        }

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:30', 'unique:master_plans,code,'.$plan->id],
            'name' => ['sometimes', 'string', 'max:200'],
            'cycleLabel' => ['sometimes', 'string', 'max:50'],
            'startDate' => ['sometimes', 'date'],
            'endDate' => ['sometimes', 'date'],
            'status' => ['sometimes', 'string', 'in:not_started,in_progress,completed,cancelled'],
            'description' => ['nullable', 'string'],
        ]);

        $map = [
            'code' => 'code', 'name' => 'name', 'cycleLabel' => 'cycle_label',
            'startDate' => 'start_date', 'endDate' => 'end_date',
            'status' => 'status', 'description' => 'description',
        ];
        foreach ($map as $in => $col) {
            if (array_key_exists($in, $data)) {
                $plan->{$col} = $data[$in];
            }
        }
        $plan->save();

        return response()->json(new MasterPlanResource($plan));
    }

    /** DELETE /master-plan/plans/{id} – xoá kế hoạch (quyền master_plan.delete). */
    public function destroyPlan(int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        if (! $actor) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $plan = MasterPlan::find($id);
        if (! $plan) {
            return $this->error('Không tìm thấy kế hoạch.', 404);
        }

        $plan->delete();

        ActivityLog::create([
            'user_id' => $actor->id,
            'action' => 'delete',
            'entity' => 'master_plan',
            'entity_id' => $id,
        ]);

        return response()->json(['status' => 'ok']);
    }

    /** POST /master-plan/tasks – tạo công việc hoặc sub-task (quyền master_plan.create). */
    public function storeTask(Request $request): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        if (! $actor) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $data = $request->validate([
            'phaseId' => ['required', 'integer', 'exists:master_plan_phases,id'],
            'parentId' => ['nullable', 'integer', 'exists:master_plan_tasks,id'],
            'code' => ['required', 'string', 'max:30'],
            'name' => ['required', 'string', 'max:250'],
            'ownerId' => ['nullable', 'integer', 'exists:users,id'],
            'departmentId' => ['nullable', 'integer', 'exists:departments,id'],
            'priority' => ['sometimes', 'in:critical,high,medium,low'],
            'startDate' => ['required', 'date'],
            'dueDate' => ['required', 'date'],
            'note' => ['nullable', 'string'],
        ]);

        if (! empty($data['parentId']) && $this->depthOf($data['parentId']) >= 5) {
            return $this->error('Chưa hỗ trợ tối đa 5 cấp công việc con.', 422);
        }

        $maxSort = (int) MasterPlanTask::where('parent_id', $data['parentId'] ?? null)->max('sort_order');

        $task = MasterPlanTask::create([
            'phase_id' => $data['phaseId'],
            'parent_id' => $data['parentId'] ?? null,
            'sort_order' => $maxSort + 1,
            'code' => $data['code'],
            'name' => $data['name'],
            'owner_id' => $data['ownerId'] ?? null,
            'department_id' => $data['departmentId'] ?? null,
            'priority' => $data['priority'] ?? 'medium',
            'status' => 'not_started',
            'progress' => 0,
            'start_date' => $data['startDate'],
            'due_date' => $data['dueDate'],
            'note' => $data['note'] ?? null,
        ]);

        ActivityLog::create([
            'user_id' => $actor->id,
            'action' => 'create',
            'entity' => LogEntity::MasterPlanTask->value,
            'entity_id' => $task->id,
        ]);

        return response()->json(new TaskResource($task), 201);
    }

    /**
     * POST /master-plan/tasks/import – import hàng loạt công việc (FE CSV gửi 1 lần duy nhất).
     * Body: { rows: [{ line?, phaseId, parentId?, code, name, ownerId?, departmentId?, priority?, startDate, dueDate, note? }] }
     * Hiệu năng: pre-load id (phase/department/user/parent) 1 lần, validate từng dòng thuần PHP (0 query/dòng),
     * insert bulk chunk 500 trong 1 transaction + activity log hàng loạt. Partial import: dòng sai trả lỗi, dòng đúng vẫn tạo.
     * Trả: { imported, errors: [{ index, line, message }] }.
     */
    public function importTasks(Request $request): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        if (! $actor) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $payload = $request->validate([
            'rows' => ['required', 'array', 'min:1', 'max:1000'],
        ]);

        $phaseIds = DB::table('master_plan_phases')->pluck('id')->flip();
        $deptIds = DB::table('departments')->pluck('id')->flip();
        $userIds = DB::table('users')->pluck('id')->flip();
        $parentIdList = array_values(array_unique(array_filter(array_map(
            static fn ($r) => is_array($r) ? ($r['parentId'] ?? null) : null,
            $payload['rows'],
        ), static fn ($v) => $v !== null && $v !== '')));
        $parentIds = $parentIdList === []
            ? collect()
            : DB::table('master_plan_tasks')->whereIn('id', $parentIdList)->pluck('id')->flip();

        $valid = [];
        $errors = [];
        foreach ($payload['rows'] as $index => $row) {
            $normalized = $this->validateImportTaskRow(is_array($row) ? $row : [], $phaseIds, $deptIds, $userIds, $parentIds);
            if (is_string($normalized)) {
                $line = is_array($row) && isset($row['line']) && is_numeric($row['line']) ? (int) $row['line'] : null;
                $errors[] = ['index' => $index, 'line' => $line, 'message' => $normalized];
                continue;
            }
            $valid[] = $normalized;
        }

        if ($valid !== []) {
            // sort_order theo parent: 1 query max() cho mỗi parent duy nhất (thường chỉ có null).
            $counters = [];
            foreach (array_unique(array_column($valid, 'parent_id')) as $parentKey) {
                $counters[$parentKey] = (int) MasterPlanTask::where('parent_id', $parentKey)->max('sort_order');
            }
            $now = now();
            $insertRows = [];
            foreach ($valid as $v) {
                $insertRows[] = $v + [
                    'sort_order' => ++$counters[$v['parent_id']],
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }

            DB::transaction(function () use ($insertRows, $actor) {
                $beforeId = (int) (MasterPlanTask::max('id') ?? 0);
                foreach (array_chunk($insertRows, 500) as $chunk) {
                    MasterPlanTask::insert($chunk);
                }
                $ids = MasterPlanTask::where('id', '>', $beforeId)->orderBy('id')->pluck('id')->all();
                $logs = [];
                foreach ($ids as $taskId) {
                    $logs[] = [
                        'user_id' => $actor->id,
                        'action' => 'create',
                        'entity' => LogEntity::MasterPlanTask->value,
                        'entity_id' => $taskId,
                    ];
                }
                if ($logs !== []) {
                    ActivityLog::insert($logs); // created_at dùng default DB (model $timestamps=false)
                }
            });
        }

        return response()->json(['imported' => count($valid), 'errors' => $errors]);
    }

    /** Validate + normalize 1 dòng import task; trả message lỗi (string) hoặc row snake_case đã chốt (array). */
    private function validateImportTaskRow(array $row, $phaseIds, $deptIds, $userIds, $parentIds): string|array
    {
        $phaseId = $row['phaseId'] ?? null;
        if (! is_numeric($phaseId) || ! $phaseIds->has((int) $phaseId)) {
            return 'phaseId không tồn tại.';
        }
        $code = trim((string) ($row['code'] ?? ''));
        if ($code === '') {
            return 'Thiếu code.';
        }
        if (mb_strlen($code) > 30) {
            return 'code tối đa 30 ký tự.';
        }
        $name = trim((string) ($row['name'] ?? ''));
        if ($name === '') {
            return 'Thiếu name.';
        }
        if (mb_strlen($name) > 250) {
            return 'name tối đa 250 ký tự.';
        }
        $startDate = (string) ($row['startDate'] ?? '');
        $dueDate = (string) ($row['dueDate'] ?? '');
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) || strtotime($startDate) === false) {
            return 'startDate phải dạng yyyy-mm-dd.';
        }
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $dueDate) || strtotime($dueDate) === false) {
            return 'dueDate phải dạng yyyy-mm-dd.';
        }
        if ($dueDate < $startDate) {
            return 'dueDate nhỏ hơn startDate.';
        }
        $priority = $row['priority'] ?? 'medium';
        if ($priority === null || $priority === '') {
            $priority = 'medium';
        }
        if (! in_array($priority, ['critical', 'high', 'medium', 'low'], true)) {
            return 'priority phải là critical|high|medium|low.';
        }
        $ownerId = $row['ownerId'] ?? null;
        if ($ownerId !== null && $ownerId !== '' && (! is_numeric($ownerId) || ! $userIds->has((int) $ownerId))) {
            return 'ownerId không tồn tại.';
        }
        $departmentId = $row['departmentId'] ?? null;
        if ($departmentId !== null && $departmentId !== '' && (! is_numeric($departmentId) || ! $deptIds->has((int) $departmentId))) {
            return 'departmentId không tồn tại.';
        }
        $parentId = $row['parentId'] ?? null;
        if ($parentId !== null && $parentId !== '') {
            if (! is_numeric($parentId) || ! $parentIds->has((int) $parentId)) {
                return 'parentId không tồn tại.';
            }
            if ($this->depthOf((int) $parentId) >= 5) {
                return 'Chưa hỗ trợ tối đa 5 cấp công việc con.';
            }
            $parentId = (int) $parentId;
        } else {
            $parentId = null;
        }

        return [
            'phase_id' => (int) $phaseId,
            'parent_id' => $parentId,
            'code' => $code,
            'name' => $name,
            'owner_id' => $ownerId === null || $ownerId === '' ? null : (int) $ownerId,
            'department_id' => $departmentId === null || $departmentId === '' ? null : (int) $departmentId,
            'priority' => $priority,
            'status' => 'not_started',
            'progress' => 0,
            'start_date' => $startDate,
            'due_date' => $dueDate,
            'note' => trim((string) ($row['note'] ?? '')) ?: null,
        ];
    }

    /** Cập nhật một task (progress/status/owner/note). Trả TaskResource (camelCase). */
    public function updateTask(Request $request, int $id): JsonResponse
    {
        $task = MasterPlanTask::find($id);
        if (! $task) {
            return $this->error('Không tìm thấy công việc.', 404);
        }

        $actor = Auth::guard('sanctum')->user();

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:30'],
            'name' => ['sometimes', 'string', 'max:250'],
            'phaseId' => ['sometimes', 'integer', 'exists:master_plan_phases,id'],
            'priority' => ['sometimes', 'in:critical,high,medium,low'],
            'status' => ['sometimes', 'string', 'in:not_started,in_progress,blocked,delayed,completed,cancelled'],
            'progress' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'ownerId' => ['sometimes', 'integer', 'exists:users,id'],
            'departmentId' => ['sometimes', 'integer', 'exists:departments,id'],
            'startDate' => ['sometimes', 'date'],
            'dueDate' => ['sometimes', 'date'],
            'note' => ['sometimes', 'nullable', 'string'],
            'result' => ['sometimes', 'nullable', 'string'],
        ]);

        if (array_key_exists('ownerId', $data) && ! $this->can($actor, 'master_plan.assign')) {
            return $this->error('Bạn không có quyền giao việc.', 403);
        }

        $oldStatus = $task->status;
        $map = [
            'code' => 'code', 'name' => 'name', 'phaseId' => 'phase_id',
            'priority' => 'priority', 'status' => 'status', 'progress' => 'progress',
            'ownerId' => 'owner_id', 'departmentId' => 'department_id',
            'startDate' => 'start_date', 'dueDate' => 'due_date',
            'note' => 'note', 'result' => 'result',
        ];
        foreach ($map as $in => $col) {
            if (array_key_exists($in, $data)) {
                $task->{$col} = $data[$in];
            }
        }
        if ($task->status === 'completed') {
            $task->progress = 100;
        }
        $task->save();

        if ($oldStatus !== $task->status) {
            ActivityLog::create([
                'user_id' => $actor->id,
                'action' => 'status_change',
                'entity' => LogEntity::MasterPlanTask->value,
                'entity_id' => $task->id,
                'old_status' => $oldStatus,
                'new_status' => $task->status,
            ]);
        }

        return response()->json(new TaskResource($task->fresh()));
    }

    /**
     * PATCH /master-plan/tasks/{id}/progress – CR Master Plan ISO.
     * Người phụ trách task (owner) được cập nhật tiến độ công việc CỦA MÌNH;
     * người có quyền master_plan.update được cập nhật cho bất kỳ task nào.
     * Giữ nguyên business rule hiện có: completed ⇒ progress = 100.
     */
    public function updateTaskProgress(Request $request, int $id): JsonResponse
    {
        $task = MasterPlanTask::find($id);
        if (! $task) {
            return $this->error('Không tìm thấy công việc.', 404);
        }

        $actor = Auth::guard('sanctum')->user();
        $isOwner = $actor && $task->owner_id !== null && (int) $task->owner_id === (int) $actor->id;
        if (! $isOwner && ! $this->can($actor, 'master_plan.update')) {
            return $this->error('Bạn chỉ được cập nhật tiến độ công việc của mình.', 403);
        }

        $data = $request->validate([
            'progress' => ['required', 'integer', 'min:0', 'max:100'],
        ]);

        $task->progress = (int) $data['progress'];
        if ($task->status === 'completed') {
            $task->progress = 100;
        }
        $task->save();

        // Audit trail (không ghi status_change – đúng NFR-02: progress-only không đổi status).
        ActivityLog::create([
            'user_id' => $actor->id,
            'action' => 'update',
            'entity' => LogEntity::MasterPlanTask->value,
            'entity_id' => $task->id,
            'properties' => json_encode(['progress' => $task->progress]),
        ]);

        return response()->json(new TaskResource($task->fresh()));
    }

    /** DELETE /master-plan/tasks/{id} – xoá công việc + toàn bộ sub-task (quyền master_plan.delete). */
    public function destroyTask(int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        if (! $actor) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $task = MasterPlanTask::find($id);
        if (! $task) {
            return $this->error('Không tìm thấy công việc.', 404);
        }

        $task->delete();

        ActivityLog::create([
            'user_id' => $actor->id,
            'action' => 'delete',
            'entity' => LogEntity::MasterPlanTask->value,
            'entity_id' => $id,
        ]);

        return response()->json(['status' => 'ok']);
    }

    /** POST /master-plan/tasks/reorder – đổi vị trí công việc trong cùng node cha (kéo-thả). */
    public function reorder(Request $request): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        if (! $actor) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $data = $request->validate([
            'orderedIds' => ['required', 'array', 'min:1'],
            'orderedIds.*' => ['integer', 'exists:master_plan_tasks,id'],
        ]);

        DB::transaction(function () use ($data) {
            foreach ($data['orderedIds'] as $index => $taskId) {
                MasterPlanTask::where('id', $taskId)->update(['sort_order' => $index + 1]);
            }
        });

        return response()->json(['status' => 'ok']);
    }

    /** Tính độ sâu của 1 task (task gốc = 1). */
    private function depthOf(int $taskId): int
    {
        $depth = 1;
        $current = MasterPlanTask::find($taskId);
        while ($current && $current->parent_id) {
            $depth++;
            $current = $current->parent;
        }

        return $depth;
    }

    private function can($actor, string $permission): bool
    {
        return $actor && $actor->roles()
            ->with('permissions')
            ->get()
            ->flatMap->permissions
            ->contains('code', $permission);
    }

    private function error(string $message, int $code): JsonResponse
    {
        return response()->json(['status' => 'error', 'message' => $message], $code);
    }


    /** GET /master-plans/{id}/summary – summary counts + weighted progress. */
    public function summary(int $id): JsonResponse
    {
        $plan = MasterPlan::find($id);
        if (! $plan) {
            return $this->error('Không tìm thấy kế hoạch.', 404);
        }

        if (! $this->can(Auth::guard('sanctum')->user(), 'master_plan.view')) {
            return $this->error('Bạn không có quyền xem kế hoạch.', 403);
        }

        $tasks = $this->service->fetchWithTree($id);
        $totalTasks = count($tasks);
        $node = [];
        foreach ($tasks as &$t) {
            $node[$t['id']] = $t;
        }

        $summary = [
            'id' => $plan->id,
            'total_tasks' => $totalTasks,
            'completed' => (int) count(array_filter($tasks, fn($t) => $t['resource_status'] === 'Completed')),
            'in_progress' => (int) count(array_filter($tasks, fn($t) => $t['resource_status'] === 'On Track')),
            'at_risk' => (int) count(array_filter($tasks, fn($t) => $t['resource_status'] === 'At Risk')),
            'delayed' => (int) count(array_filter($tasks, fn($t) => $t['resource_status'] === 'Delayed')),
            'progress' => $this->service->computeSummaryProgress($tasks),
        ];

        return response()->json(['summary' => $summary, 'nodes' => $node, 'total_tasks' => $totalTasks]);
    }

    /** GET /master-plans/{id}/detail – tree nodes wrapped in MasterPlanResource. */
    public function detail(int $id): JsonResponse
    {
        $plan = MasterPlan::find($id);
        if (! $plan) {
            return $this->error('Không tìm thấy kế hoạch.', 404);
        }

        if (! $this->can(Auth::guard('sanctum')->user(), 'master_plan.view')) {
            return $this->error('Bạn không có quyền xem kế hoạch.', 403);
        }

        $tasks = $this->service->fetchWithTree($id);
        $nodes = [];
        foreach ($tasks as &$t) {
            $nodes[$t['id']] = $t;
        }

        $children = function ($parentId) use (&$children, &$nodes) {
            $out = [];
            foreach ($nodes as $n) {
                if ($n['parent_id'] == $parentId) {
                    $n['children'] = $children($n['id']);
                    $out[] = $n;
                }
            }
            return $out;
        };

        return response()->json([
            'plan' => $plan->toArray(),
            'tree' => $children(null),
        ]);
    }

    /** GET /master-plans/{id}/gantt – shared time scale + bars. */
    public function gantt(int $id, Request $request): JsonResponse
    {
        $plan = MasterPlan::find($id);
        if (! $plan) {
            return $this->error('Không tìm thấy kế hoạch.', 404);
        }

        if (! $this->can(Auth::guard('sanctum')->user(), 'master_plan.view')) {
            return $this->error('Bạn không có quyền xem kế hoạch.', 403);
        }

        $tasks = $this->service->fetchWithTree($id);
        $today = new \DateTime();
        $level = (int) $request->input('level', 0);

        $rows = $this->buildGanttRows($tasks, $today, $level);
        $scale = $this->buildGanttScale($tasks, $today);

        return response()->json([
            'plan_id' => $plan->id,
            'today' => $today->format('Y-m-d'),
            'scale' => $scale,
            'rows' => $rows,
        ]);
    }

    /** GET /master-plans/{id}/levels – available expansion levels. */
    public function levels(int $id): JsonResponse
    {
        $plan = MasterPlan::find($id);
        if (! $plan) {
            return $this->error('Không tìm thấy kế hoạch.', 404);
        }

        if (! $this->can(Auth::guard('sanctum')->user(), 'master_plan.view')) {
            return $this->error('Bạn không có quyền xem kế hoạch.', 403);
        }

        $levels = [];
        foreach (range(0, 4) as $l) {
            $levels[$l] = (bool) $this->service->hasLevelTasks($id, $l);
        }

        return response()->json($levels);
    }


    /** POST /master-plans/{id}/tasks/reorder – DFS order + auto WBS. */
    public function reorderMasterPlanTasks(Request $request, int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        if (! $actor) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        if (! $this->can($actor, 'master_plan.update')) {
            return $this->error('Bạn không có quyền sắp xếp công việc.', 403);
        }

        $data = $request->validate([
            'orderedIds' => ['required', 'array', 'min:1'],
            'orderedIds.*' => ['integer', 'exists:master_plan_tasks,id'],
        ]);

        $this->service->validateReorderOrder($id, $data['orderedIds']);

        DB::transaction(function () use ($id, $data) {
            $this->service->reorder($id, $data['orderedIds']);
        });

        ActivityLog::create([
            'user_id' => $actor->id,
            'action' => 'reorder',
            'entity' => LogEntity::MasterPlanTask->value,
            'entity_id' => count($data['orderedIds']),
        ]);

        return response()->json(['status' => 'ok']);
    }

    /** POST /master-plan-tasks/{id}/dependencies – tạo phụ thuộc (FS/SS/FF/SF). */
    public function createDependency(Request $request, int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        if (! $actor) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        if (! $this->can($actor, 'master_plan.update')) {
            return $this->error('Bạn không có quyền thêm phụ thuộc.', 403);
        }

        $data = $request->validate([
            'successor_task_id' => ['required', 'integer', 'exists:master_plan_tasks,id'],
            'dependency_type' => ['required', 'string', 'in:FS,SS,FF,SF'],
            'lag_days' => ['sometimes', 'integer', 'min:0'],
        ]);

        $predecessorTask = MasterPlanTask::find($id);
        $successorTask = MasterPlanTask::find($data['successor_task_id']);
        if (! $predecessorTask || ! $successorTask) {
            return $this->error('Không tìm thấy công việc.', 404);
        }

        $existing = MasterPlanDependency::where('predecessor_task_id', $id)
            ->where('successor_task_id', $data['successor_task_id'])
            ->where('dependency_type', $data['dependency_type'])
            ->get()
            ->toArray();

        $errors = $this->service->validateDependency($id, $id, $data['successor_task_id'], $data['dependency_type'], $existing);
        if ($errors) {
            return response()->json(['status' => 'error', 'errors' => $errors], 422);
        }

        $dep = MasterPlanDependency::create([
            'master_plan_id' => $predecessorTask->master_plan_id,
            'predecessor_task_id' => $id,
            'successor_task_id' => $data['successor_task_id'],
            'dependency_type' => $data['dependency_type'],
            'lag_days' => (int) ($data['lag_days'] ?? 0),
        ]);

        ActivityLog::create([
            'user_id' => $actor->id,
            'action' => 'dependency',
            'entity' => LogEntity::Dependency->value,
            'entity_id' => $dep->id,
            'predecessor_task_id' => $predecessorTask->id,
            'successor_task_id' => $successorTask->id,
            'dependency_type' => $data['dependency_type'],
        ]);

        return response()->json(new TaskDependencyResource($dep));
    }

    /** DELETE /master-plan-tasks/{id}/dependencies/{depId} – xóa phụ thuộc. */
    public function destroyDependency(Request $request, int $id, int $depId): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        if (! $actor) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        if (! $this->can($actor, 'master_plan.update')) {
            return $this->error('Bạn không có quyền xóa phụ thuộc.', 403);
        }

        $dep = MasterPlanDependency::find($depId);
        if (! $dep) {
            return $this->error('Không tìm thấy phụ thuộc.', 404);
        }

        $dep->delete();

        ActivityLog::create([
            'user_id' => $actor->id,
            'action' => 'dependency',
            'entity' => LogEntity::Dependency->value,
            'entity_id' => $depId,
            'predecessor_task_id' => $dep->predecessor_task_id,
            'successor_task_id' => $dep->successor_task_id,
            'dependency_type' => $dep->dependency_type,
        ]);

        return response()->json(['status' => 'ok']);
    }

    /** GET /master-plan-tasks/{id}?include=dependencies – task + dependsOn/dependsOnBy. */
    public function taskWithDependencies(int $id): JsonResponse
    {
        $task = MasterPlanTask::find($id);
        if (! $task) {
            return $this->error('Không tìm thấy công việc.', 404);
        }

        if (! $this->can(Auth::guard('sanctum')->user(), 'master_plan.view')) {
            return $this->error('Bạn không có quyền xem công việc.', 403);
        }

        $dependencies = MasterPlanDependency::where('predecessor_task_id', $id)
            ->with(['successor', 'successor.phase', 'successor.owner', 'successor.department'])
            ->get();

        $dependsOn = $dependencies->map(function (MasterPlanDependency $d) {
            return new TaskResource($d->successor);
        });

        $dependsOnBy = $dependencies->pluck('dependency_type')->toArray();

        return response()->json([
            'task' => new TaskResource($task),
            'dependsOn' => $dependsOn,
            'dependsOnBy' => $dependsOnBy,
        ]);
    }


    /** GET /master-plans/{id}/tasks – cây WBS + meta (WBS, status, dependency counts). */
    public function tasks(int $id): JsonResponse
    {
        $plan = MasterPlan::find($id);
        if (! $plan) {
            return $this->error('Không tìm thấy kế hoạch.', 404);
        }

        if (! $this->can(Auth::guard('sanctum')->user(), 'master_plan.view')) {
            return $this->error('Bạn không có quyền xem kế hoạch.', 403);
        }

        $tasks = $this->service->fetchWithTree($id);
        $phases = MasterPlanPhase::where('master_plan_id', $id)->orderBy('sort_order')->get();

        return response()->json([
            'plan_id' => $plan->id,
            'tasks' => $tasks,
            'phases' => $phases,
        ]);
    }

    /** POST /master-plans/{id}/tasks – tạo task/sub-task + tính WBS. */
    public function storeMasterPlanTask(Request $request, int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        if (! $actor) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        if (! $this->can($actor, 'master_plan.create')) {
            return $this->error('Bạn không có quyền tạo công việc.', 403);
        }

        $data = $this->validateTaskPayload($request->all(), $id);
        if (is_array($data) && isset($data['errors'])) {
            return response()->json(['status' => 'error', 'errors' => $data['errors']], 422);
        }

        $task = $this->service->createTask($id, $data, $actor);

        ActivityLog::create([
            'user_id' => $actor->id,
            'action' => 'create',
            'entity' => LogEntity::MasterPlanTask->value,
            'entity_id' => $task->id,
            'parent_id' => $task->parent_id,
            'code' => $task->code,
        ]);

        return response()->json(new TaskResource($task->fresh()), 201);
    }

    /** PATCH /master-plan-tasks/{id} – sửa task. */
    public function updateMasterPlanTask(Request $request, int $id): JsonResponse
    {
        $task = MasterPlanTask::find($id);
        if (! $task) {
            return $this->error('Không tìm thấy công việc.', 404);
        }

        $actor = Auth::guard('sanctum')->user();
        if (! $this->can($actor, 'master_plan.update')) {
            return $this->error('Bạn không có quyền sửa công việc.', 403);
        }

        $data = $this->validateTaskPayload($request->all(), $task->master_plan_id, $id);
        if (is_array($data) && isset($data['errors'])) {
            return response()->json(['status' => 'error', 'errors' => $data['errors']], 422);
        }

        $oldStatus = $task->status;
        $this->service->updateTask($task, $data, $actor);

        if ($oldStatus !== $task->status) {
            ActivityLog::create([
                'user_id' => $actor->id,
                'action' => 'status_change',
                'entity' => LogEntity::MasterPlanTask->value,
                'entity_id' => $task->id,
                'old_status' => $oldStatus,
                'new_status' => $task->status,
            ]);
        }

        return response()->json(new TaskResource($task->fresh()));
    }

    /** DELETE /master-plan-tasks/{id} – xoá task + con. */
    public function destroyMasterPlanTask(int $id): JsonResponse
    {
        $actor = Auth::guard('sanctum')->user();
        if (! $actor) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        if (! $this->can($actor, 'master_plan.delete')) {
            return $this->error('Bạn không có quyền xóa công việc.', 403);
        }

        $task = MasterPlanTask::find($id);
        if (! $task) {
            return $this->error('Không tìm thấy công việc.', 404);
        }

        $task->delete();

        ActivityLog::create([
            'user_id' => $actor->id,
            'action' => 'delete',
            'entity' => LogEntity::MasterPlanTask->value,
            'entity_id' => $id,
        ]);

        return response()->json(['status' => 'ok']);
    }

}
