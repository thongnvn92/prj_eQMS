<?php

namespace App\Http\Controllers\Api;

use App\Enums\LogEntity;
use App\Http\Controllers\Controller;
use App\Http\Resources\ActionResource;
use App\Models\Action;
use App\Models\ActivityLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class ActionsController extends Controller
{
    /** GET /actions – trả ActionResource[] (camelCase). */
    public function index(): JsonResponse
    {
        $actions = Action::with(['department', 'owner', 'issue', 'relatedDocument', 'relatedTask', 'evidences'])
            ->orderBy('code')
            ->get();

        // Trả MẢNG trực tiếp (không bọc { data }) để khớp contract mock FE.
        return response()->json(ActionResource::collection($actions));
    }

    /**
     * PATCH /actions/{id} – cập nhật title/source/ownerId/departmentId/dueDate/status/progress/result/evidence.
     * Quyền chi tiết đã kiểm ở route middleware (permission:action.update|action.verify).
     * State machine verify/close + ownership normal_user xử lý bên dưới.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $action = Action::find($id);
        if (! $action) {
            return $this->error('Không tìm thấy Action.', 404);
        }

        $data = $request->validate([
            'status' => ['sometimes', 'string', 'in:open,in_progress,blocked,overdue,pending_verification,verified,closed'],
            'progress' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'result' => ['sometimes', 'nullable', 'string'],
            'evidence' => ['sometimes', 'nullable', 'string'],
            'title' => ['sometimes', 'string', 'max:250'],
            'source' => ['sometimes', 'string', 'in:audit_finding,ncr,complaint,risk,opportunity,management,internal_audit,other'],
            'ownerId' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'departmentId' => ['sometimes', 'nullable', 'integer', 'exists:departments,id'],
            'dueDate' => ['sometimes', 'date'],
            'relatedRiskId' => ['sometimes', 'nullable', 'integer', 'exists:risks,id'],
            'relatedOpportunityId' => ['sometimes', 'nullable', 'integer', 'exists:opportunities,id'],
        ]);

        // Ownership (resource-level): normal_user chỉ đụng Action của mình.
        $isNormalUser = $user->roles->pluck('code')->contains('normal_user');
        if ($isNormalUser && (int) $action->owner_id !== (int) $user->id) {
            return $this->error('Bạn chỉ được cập nhật Action do mình phụ trách.', 403);
        }

        $permissions = $user->roles->flatMap->permissions->pluck('code');
        $target = $data['status'] ?? null;

        // State machine verify/close.
        if ($target === 'verified') {
            if (! $permissions->contains('action.verify')) {
                return $this->error('Bạn không có quyền xác minh Action.', 403);
            }
            if ($action->status !== 'pending_verification') {
                return $this->error('Chỉ xác minh Action đang ở trạng thái "Chờ xác minh".', 409);
            }
        } elseif ($target === 'closed') {
            if (! $permissions->contains('action.close')) {
                return $this->error('Bạn không có quyền đóng Action.', 403);
            }
            if ($action->status !== 'verified') {
                return $this->error('Chỉ đóng Action khi đã được xác minh (verified).', 409);
            }
            if (! trim((string) ($data['evidence'] ?? $action->evidence ?? ''))) {
                return $this->error('Bắt buộc ghi Evidence trước khi đóng Action.', 400);
            }
        } elseif (! $permissions->contains('action.update') && ! $permissions->contains('action.verify')) {
            return $this->error('Bạn không có quyền thực hiện thao tác này.', 403);
        }

        $oldStatus = $action->status;
        if (array_key_exists('status', $data)) {
            $action->status = $data['status'];
        }
        if (array_key_exists('progress', $data)) {
            $action->progress = $data['progress'];
        }
        if (array_key_exists('result', $data)) {
            $action->result = $data['result'];
        }
        if (array_key_exists('evidence', $data)) {
            $action->evidence = $data['evidence'];
        }
        // Các cột thông tin cho phép sửa ở form Cập nhật (khớp ActionsPage).
        foreach (['title' => 'title', 'source' => 'source', 'ownerId' => 'owner_id', 'departmentId' => 'department_id', 'dueDate' => 'due_date'] as $in => $col) {
            if (array_key_exists($in, $data)) {
                $action->{$col} = $data[$in];
            }
        }
        // Liên kết Risk/Opportunity cho phép cả null (unlink) – khác các cột info ở trên.
        if (array_key_exists('relatedRiskId', $data)) {
            $action->related_risk_id = $data['relatedRiskId'];
        }
        if (array_key_exists('relatedOpportunityId', $data)) {
            $action->related_opportunity_id = $data['relatedOpportunityId'];
        }
        // Tự đồng bộ source khi liên kết Risk/Opportunity (khớp ngữ nghĩa ActionSource).
        if (array_key_exists('relatedRiskId', $data) && $data['relatedRiskId'] !== null) {
            $action->source = 'risk';
        } elseif (array_key_exists('relatedOpportunityId', $data) && $data['relatedOpportunityId'] !== null) {
            $action->source = 'opportunity';
        }
        if (in_array($action->status, ['verified', 'closed'], true)) {
            $action->progress = 100;
        }

        $oldRiskId = $action->getOriginal('related_risk_id');
        $oldOppId = $action->getOriginal('related_opportunity_id');
        $action->save();

        // Audit: link/unlink Action ↔ Risk/Opportunity.
        $newRiskId = $action->related_risk_id;
        $newOppId = $action->related_opportunity_id;
        if ((int) $oldRiskId !== (int) $newRiskId && $oldRiskId !== null) {
            ActivityLog::create(['user_id' => $user->id, 'action' => 'unlink_action', 'entity' => LogEntity::Risk->value, 'entity_id' => (int) $oldRiskId]);
        }
        if ($newRiskId !== null && (int) $oldRiskId !== (int) $newRiskId) {
            ActivityLog::create(['user_id' => $user->id, 'action' => 'link_action', 'entity' => LogEntity::Risk->value, 'entity_id' => (int) $newRiskId]);
        }
        if ((int) $oldOppId !== (int) $newOppId && $oldOppId !== null) {
            ActivityLog::create(['user_id' => $user->id, 'action' => 'unlink_action', 'entity' => LogEntity::Opportunity->value, 'entity_id' => (int) $oldOppId]);
        }
        if ($newOppId !== null && (int) $oldOppId !== (int) $newOppId) {
            ActivityLog::create(['user_id' => $user->id, 'action' => 'link_action', 'entity' => LogEntity::Opportunity->value, 'entity_id' => (int) $newOppId]);
        }

        if ($oldStatus !== $action->status) {
            ActivityLog::create([
                'user_id' => $user->id,
                'action' => 'status_change',
                'entity' => LogEntity::Action->value,
                'entity_id' => $action->id,
                'old_status' => $oldStatus,
                'new_status' => $action->status,
            ]);
        }

        // Trả object trực tiếp (không bọc { data }) để khớp contract mock FE.
        return response()->json(new ActionResource($action->fresh()));
    }

    /** POST /actions – tạo Action (quyền action.create). */
    public function store(Request $request): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $data = $request->validate([
            'code' => ['required', 'string', 'max:30', 'unique:actions,code'],
            'title' => ['required', 'string', 'max:250'],
            'description' => ['nullable', 'string'],
            'source' => ['required', 'string', 'in:audit_finding,ncr,complaint,risk,opportunity,management,internal_audit,other'],
            'departmentId' => ['nullable', 'integer', 'exists:departments,id'],
            'ownerId' => ['nullable', 'integer', 'exists:users,id'],
            'issueDescription' => ['nullable', 'string'],
            'relatedDocumentId' => ['nullable', 'integer', 'exists:documents,id'],
            'relatedTaskId' => ['nullable', 'integer', 'exists:master_plan_tasks,id'],
            'relatedRiskId' => ['nullable', 'integer', 'exists:risks,id'],
            'relatedOpportunityId' => ['nullable', 'integer', 'exists:opportunities,id'],
            'dueDate' => ['required', 'date'],
        ]);

        // Tự đồng bộ source khi liên kết Risk/Opportunity (khớp ngữ nghĩa ActionSource).
        $source = $data['source'];
        if (($data['relatedRiskId'] ?? null) !== null) {
            $source = 'risk';
        } elseif (($data['relatedOpportunityId'] ?? null) !== null) {
            $source = 'opportunity';
        }

        $action = Action::create([
            'code' => $data['code'],
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'source' => $source,
            'department_id' => $data['departmentId'] ?? $user->department_id,
            'owner_id' => $data['ownerId'] ?? $user->id,
            'issue_description' => $data['issueDescription'] ?? null,
            'related_document_id' => $data['relatedDocumentId'] ?? null,
            'related_task_id' => $data['relatedTaskId'] ?? null,
            'related_risk_id' => $data['relatedRiskId'] ?? null,
            'related_opportunity_id' => $data['relatedOpportunityId'] ?? null,
            'created_by' => $user->id,
            'due_date' => $data['dueDate'],
            'status' => 'open',
            'progress' => 0,
        ]);

        // Audit: link Action ↔ Risk/Opportunity ngay khi tạo.
        if ($action->related_risk_id) {
            ActivityLog::create(['user_id' => $user->id, 'action' => 'link_action', 'entity' => LogEntity::Risk->value, 'entity_id' => (int) $action->related_risk_id]);
        }
        if ($action->related_opportunity_id) {
            ActivityLog::create(['user_id' => $user->id, 'action' => 'link_action', 'entity' => LogEntity::Opportunity->value, 'entity_id' => (int) $action->related_opportunity_id]);
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'create',
            'entity' => LogEntity::Action->value,
            'entity_id' => $action->id,
        ]);

        return response()->json(new ActionResource($action), 201);
    }

    /** DELETE /actions/{id} – xoá Action (quyền action.delete). */
    public function destroy(int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $action = Action::find($id);
        if (! $action) {
            return $this->error('Không tìm thấy Action.', 404);
        }

        $action->delete();

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'delete',
            'entity' => LogEntity::Action->value,
            'entity_id' => $id,
        ]);

        return response()->json(['status' => 'ok']);
    }

    private function error(string $message, int $code): JsonResponse
    {
        return response()->json(['status' => 'error', 'message' => $message], $code);
    }
}
