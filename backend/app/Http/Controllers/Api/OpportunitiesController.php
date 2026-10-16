<?php

namespace App\Http\Controllers\Api;

use App\Enums\LogEntity;
use App\Http\Controllers\Controller;
use App\Http\Resources\OpportunityResource;
use App\Models\ActivityLog;
use App\Models\Opportunity;
use App\Support\RiskSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

/**
 * Opportunity Register – QT-BISO.03-BM.03.
 * Business rule: score = feasibility × benefit;
 * 1–4 ignore, 5–10 research, >=12 priority. KHÔNG tin score từ client.
 */
class OpportunitiesController extends Controller
{
    /** GET /opportunities – danh sách Cơ hội (kèm Actions liên kết). */
    public function index(Request $request): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $query = Opportunity::with(['actions', 'department', 'owner'])
            ->orderByDesc('opportunity_score')
            ->orderByDesc('id');

        if ($this->isDeptManagerOnly($user)) {
            $query->where('department_id', $user->department_id);
        }

        return response()->json(OpportunityResource::collection($query->get()));
    }

    /** POST /opportunities – tạo Cơ hội. Score/level do backend tính. */
    public function store(Request $request): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $data = $request->validate($this->rules());

        $score = RiskSupport::opportunityScore((int) $data['feasibility'], (int) $data['benefit']);
        $level = RiskSupport::opportunityLevel($score);

        $opp = Opportunity::create([
            'code' => $data['code'] ?? RiskSupport::nextCode(Opportunity::class, 'OPP'),
            'source_type' => $data['sourceType'],
            'category' => $data['category'] ?? null,
            'objective' => $data['objective'] ?? null,
            'description' => $data['description'] ?? null,
            'feasibility' => (int) $data['feasibility'],
            'benefit' => (int) $data['benefit'],
            'opportunity_score' => $score,
            'opportunity_level' => $level->value,
            'solution' => $data['solution'] ?? null,
            'expected_result' => $data['expectedResult'] ?? null,
            'actual_result' => $data['actualResult'] ?? null,
            'owner_id' => $data['ownerId'] ?? $user->id,
            'department_id' => $data['departmentId'] ?? $user->department_id,
            'start_date' => $data['startDate'] ?? null,
            'due_date' => $data['dueDate'] ?? null,
            'review_frequency' => $data['reviewFrequency'] ?? null,
            'next_review_date' => $data['nextReviewDate'] ?? null,
            'status' => 'open',
            'created_by' => $user->id,
            'updated_by' => $user->id,
        ]);

        $this->log($user->id, 'create', $opp->id);

        return response()->json(new OpportunityResource($opp), 201);
    }

    /** GET /opportunities/{id} – chi tiết Cơ hội + Actions liên kết. */
    public function show(int $id): JsonResponse
    {
        $opp = Opportunity::with(['actions.evidences', 'department', 'owner'])->find($id);
        if (! $opp) {
            return $this->error('Không tìm thấy Cơ hội.', 404);
        }

        return response()->json(new OpportunityResource($opp));
    }

    /**
     * PATCH /opportunities/{id} – cập nhật thông tin + trạng thái.
     * KHÔNG nhận feasibility/benefit ở đây (chỉ qua /evaluate).
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $opp = Opportunity::find($id);
        if (! $opp) {
            return $this->error('Không tìm thấy Cơ hội.', 404);
        }

        if ($this->isDeptManagerOnly($user) && (int) $opp->department_id !== (int) $user->department_id) {
            return $this->error('Bạn chỉ được cập nhật Cơ hội trong phòng của mình.', 403);
        }

        $data = $request->validate($this->rules(true, $id));

        $permissions = $user->roles->flatMap->permissions->pluck('code');
        $targetStatus = $data['status'] ?? null;
        if ($targetStatus === 'closed' && $targetStatus !== $opp->status && ! $permissions->contains('opportunity.close')) {
            return $this->error('Bạn không có quyền đóng Cơ hội.', 403);
        }

        $map = [
            'sourceType' => 'source_type', 'category' => 'category', 'objective' => 'objective',
            'description' => 'description', 'solution' => 'solution', 'expectedResult' => 'expected_result',
            'actualResult' => 'actual_result', 'ownerId' => 'owner_id', 'departmentId' => 'department_id',
            'startDate' => 'start_date', 'dueDate' => 'due_date', 'reviewFrequency' => 'review_frequency',
            'nextReviewDate' => 'next_review_date', 'status' => 'status',
        ];
        $oldStatus = $opp->status;
        foreach ($map as $in => $col) {
            if (array_key_exists($in, $data) && $data[$in] !== null) {
                $opp->{$col} = $data[$in];
            }
        }
        $opp->updated_by = $user->id;
        $opp->save();

        if ($targetStatus !== null && $targetStatus !== $oldStatus) {
            $this->log($user->id, 'status_change', $opp->id, $oldStatus, $opp->status);
        } else {
            $this->log($user->id, 'update', $opp->id);
        }

        return response()->json(new OpportunityResource($opp->fresh(['actions'])));
    }

    /** POST /opportunities/{id}/evaluate – đánh giá lại feasibility/benefit. */
    public function evaluate(Request $request, int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $opp = Opportunity::find($id);
        if (! $opp) {
            return $this->error('Không tìm thấy Cơ hội.', 404);
        }

        if ($this->isDeptManagerOnly($user) && (int) $opp->department_id !== (int) $user->department_id) {
            return $this->error('Bạn chỉ được đánh giá Cơ hội trong phòng của mình.', 403);
        }

        $data = $request->validate([
            'feasibility' => ['required', 'integer', 'min:1', 'max:5'],
            'benefit' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:1000'],
        ]);

        $score = RiskSupport::opportunityScore((int) $data['feasibility'], (int) $data['benefit']);
        $level = RiskSupport::opportunityLevel($score);

        $oldScore = (int) $opp->opportunity_score;
        $opp->feasibility = (int) $data['feasibility'];
        $opp->benefit = (int) $data['benefit'];
        $opp->opportunity_score = $score;
        $opp->opportunity_level = $level->value;
        $opp->updated_by = $user->id;
        $opp->save();

        $this->log($user->id, 'evaluate', $opp->id, (string) $oldScore, (string) $score, $data['comment'] ?? null);

        return response()->json(new OpportunityResource($opp->fresh(['actions'])));
    }

    /** DELETE /opportunities/{id} – xóa Cơ hội (quyền opportunity.delete). */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $opp = Opportunity::find($id);
        if (! $opp) {
            return $this->error('Không tìm thấy Cơ hội.', 404);
        }

        $opp->delete();
        $this->log($user->id, 'delete', $id);

        return response()->json(['status' => 'ok']);
    }

    /** Rule validate: store (required) hoặc update (sometimes). KHÔNG có score/level. */
    private function rules(bool $partial = false, ?int $ignoreId = null): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $catKeys = implode(',', array_keys(RiskSupport::CATEGORIES));
        $freqKeys = implode(',', RiskSupport::REVIEW_FREQUENCIES);

        return [
            // code optional khi tạo (backend tự sinh OPP-### nếu client không gửi).
            'code' => $partial
                ? ['sometimes', 'string', 'max:30', Rule::unique('opportunities', 'code')->ignore($ignoreId)]
                : ['nullable', 'string', 'max:30', Rule::unique('opportunities', 'code')],
            'sourceType' => [$req, 'string', 'in:'.implode(',', RiskSupport::SOURCE_TYPES)],
            'category' => ['nullable', 'string', 'in:'.$catKeys],
            'objective' => ['nullable', 'string', 'max:250'],
            'description' => ['nullable', 'string'],
            'feasibility' => [$req, 'integer', 'min:1', 'max:5'],
            'benefit' => [$req, 'integer', 'min:1', 'max:5'],
            'solution' => ['nullable', 'string'],
            'expectedResult' => ['nullable', 'string'],
            'actualResult' => ['nullable', 'string'],
            'ownerId' => ['nullable', 'integer', 'exists:users,id'],
            'departmentId' => ['nullable', 'integer', 'exists:departments,id'],
            'startDate' => ['nullable', 'date'],
            'dueDate' => ['nullable', 'date'],
            'reviewFrequency' => ['nullable', 'string', 'in:'.$freqKeys],
            'nextReviewDate' => ['nullable', 'date'],
            'status' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', RiskSupport::STATUSES)],
        ];
    }

    /** dept_manager (không có quyền tạo) chỉ thao tác trong phạm vi phòng ban. */
    private function isDeptManagerOnly($user): bool
    {
        $codes = $user->roles->pluck('code');
        $permissions = $user->roles->flatMap->permissions->pluck('code');

        return $codes->contains('dept_manager') && ! $permissions->contains('opportunity.create');
    }

    private function log(int $userId, string $action, int $entityId, ?string $old = null, ?string $new = null, ?string $comment = null): void
    {
        ActivityLog::create([
            'user_id' => $userId,
            'action' => $action,
            'entity' => LogEntity::Opportunity->value,
            'entity_id' => $entityId,
            'old_status' => $old,
            'new_status' => $new,
            'properties' => $comment !== null ? json_encode(['comment' => $comment]) : null,
        ]);
    }

    private function error(string $message, int $code): JsonResponse
    {
        return response()->json(['status' => 'error', 'message' => $message], $code);
    }
}
