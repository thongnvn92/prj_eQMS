<?php

namespace App\Http\Controllers\Api;

use App\Enums\LogEntity;
use App\Http\Controllers\Controller;
use App\Http\Resources\RiskAssessmentResource;
use App\Http\Resources\RiskResource;
use App\Models\ActivityLog;
use App\Models\Risk;
use App\Models\RiskAssessment;
use App\Support\RiskSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

/**
 * Risk Register – QT-BISO.03-BM.02.
 * Business rule: score = likelihood × impact; level do backend phân loại
 * (1–4 low, 5–10 medium, >=12 high). KHÔNG tin score/level từ client.
 */
class RisksController extends Controller
{
    /** GET /risks – danh sách Risk (kèm Actions liên kết để tính progress). */
    public function index(Request $request): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $query = Risk::with(['actions', 'department', 'owner'])
            ->orderByDesc('risk_score')
            ->orderByDesc('id');

        // Scope: dept_manager chỉ thấy Risk trong phòng của mình.
        if ($this->isDeptManagerOnly($user)) {
            $query->where('department_id', $user->department_id);
        }

        return response()->json(RiskResource::collection($query->get()));
    }

    /** POST /risks – tạo Risk (quyền risk.create). Score/level do backend tính. */
    public function store(Request $request): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $data = $request->validate($this->rules());

        $score = RiskSupport::riskScore((int) $data['likelihood'], (int) $data['impact']);
        $level = RiskSupport::riskLevel($score);

        $risk = Risk::create([
            'code' => $data['code'] ?? RiskSupport::nextCode(Risk::class, 'RISK'),
            'source_type' => $data['sourceType'],
            'category' => $data['category'] ?? null,
            'objective' => $data['objective'] ?? null,
            'description' => $data['description'] ?? null,
            'likelihood' => (int) $data['likelihood'],
            'impact' => (int) $data['impact'],
            'risk_score' => $score,
            'risk_level' => $level->value,
            'initial_likelihood' => (int) $data['likelihood'],
            'initial_impact' => (int) $data['impact'],
            'initial_score' => $score,
            'initial_level' => $level->value,
            'treatment' => $data['treatment'] ?? null,
            'expected_result' => $data['expectedResult'] ?? null,
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

        // Dòng đánh giá đầu tiên (initial) – không bao giờ bị overwrite.
        RiskAssessment::create([
            'risk_id' => $risk->id,
            'kind' => 'initial',
            'likelihood' => $risk->likelihood,
            'impact' => $risk->impact,
            'score' => $risk->risk_score,
            'level' => $risk->risk_level,
            'assessed_by' => $user->id,
        ]);

        $this->log($user->id, 'create', $risk->id);

        return response()->json(new RiskResource($risk), 201);
    }

    /** GET /risks/{id} – chi tiết Risk + Actions + Lịch sử đánh giá. */
    public function show(int $id): JsonResponse
    {
        $risk = Risk::with(['actions.evidences', 'assessments', 'department', 'owner'])->find($id);
        if (! $risk) {
            return $this->error('Không tìm thấy Rủi ro.', 404);
        }

        return response()->json(new RiskResource($risk));
    }

    /** GET /risks/{id}/history – lịch sử đánh giá (initial + residual). */
    public function history(int $id): JsonResponse
    {
        $risk = Risk::find($id);
        if (! $risk) {
            return $this->error('Không tìm thấy Rủi ro.', 404);
        }

        $assessments = RiskAssessment::where('risk_id', $id)->orderBy('id')->get();

        return response()->json(RiskAssessmentResource::collection($assessments));
    }

    /**
     * PATCH /risks/{id} – cập nhật thông tin + trạng thái.
     * KHÔNG nhận likelihood/impact ở đây (chỉ qua /evaluate để lưu lịch sử).
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $risk = Risk::find($id);
        if (! $risk) {
            return $this->error('Không tìm thấy Rủi ro.', 404);
        }

        if ($this->isDeptManagerOnly($user) && (int) $risk->department_id !== (int) $user->department_id) {
            return $this->error('Bạn chỉ được cập nhật Rủi ro trong phòng của mình.', 403);
        }

        $data = $request->validate($this->rules(true, $id));

        $permissions = $user->roles->flatMap->permissions->pluck('code');
        $targetStatus = $data['status'] ?? null;
        if ($targetStatus === 'closed' && $targetStatus !== $risk->status && ! $permissions->contains('risk.close')) {
            return $this->error('Bạn không có quyền đóng Rủi ro.', 403);
        }

        $map = [
            'sourceType' => 'source_type', 'category' => 'category', 'objective' => 'objective',
            'description' => 'description', 'treatment' => 'treatment', 'expectedResult' => 'expected_result',
            'ownerId' => 'owner_id', 'departmentId' => 'department_id', 'startDate' => 'start_date',
            'dueDate' => 'due_date', 'reviewFrequency' => 'review_frequency', 'nextReviewDate' => 'next_review_date',
            'status' => 'status',
        ];
        $oldStatus = $risk->status;
        foreach ($map as $in => $col) {
            if (array_key_exists($in, $data) && $data[$in] !== null) {
                $risk->{$col} = $data[$in];
            }
        }
        $risk->updated_by = $user->id;
        $risk->save();

        // Log theo type status_change khi đổi trạng thái (khớp NFR-02), còn lại là update.
        if ($targetStatus !== null && $targetStatus !== $oldStatus) {
            $this->log($user->id, 'status_change', $risk->id, $oldStatus, $risk->status);
        } else {
            $this->log($user->id, 'update', $risk->id);
        }

        return response()->json(new RiskResource($risk->fresh(['actions'])));
    }

    /**
     * POST /risks/{id}/evaluate – Đánh giá lại (Residual Risk).
     * KHÔNG BAO GIỜ overwrite initial_* (AC-08).
     */
    public function evaluate(Request $request, int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $risk = Risk::find($id);
        if (! $risk) {
            return $this->error('Không tìm thấy Rủi ro.', 404);
        }

        if ($this->isDeptManagerOnly($user) && (int) $risk->department_id !== (int) $user->department_id) {
            return $this->error('Bạn chỉ được đánh giá Rủi ro trong phòng của mình.', 403);
        }

        $data = $request->validate([
            'likelihood' => ['required', 'integer', 'min:1', 'max:5'],
            'impact' => ['required', 'integer', 'min:1', 'max:5'],
            'comment' => ['nullable', 'string', 'max:1000'],
        ]);

        $score = RiskSupport::riskScore((int) $data['likelihood'], (int) $data['impact']);
        $level = RiskSupport::riskLevel($score);

        $oldScore = (int) $risk->risk_score;
        $risk->likelihood = (int) $data['likelihood'];
        $risk->impact = (int) $data['impact'];
        $risk->risk_score = $score; // Chỉ đổi giá trị HIỆN TẠI – initial_* giữ nguyên.
        $risk->risk_level = $level->value;
        $risk->last_reviewed_by = $user->id;
        $risk->last_reviewed_at = now();
        $risk->last_review_comment = $data['comment'] ?? null;
        $risk->updated_by = $user->id;
        $risk->save();

        RiskAssessment::create([
            'risk_id' => $risk->id,
            'kind' => 'residual',
            'likelihood' => $risk->likelihood,
            'impact' => $risk->impact,
            'score' => $score,
            'level' => $level->value,
            'assessed_by' => $user->id,
            'comment' => $data['comment'] ?? null,
        ]);

        $this->log($user->id, 'evaluate', $risk->id, (string) $oldScore, (string) $score);

        return response()->json(new RiskResource($risk->fresh(['actions', 'assessments'])));
    }

    /** DELETE /risks/{id} – xóa Risk (quyền risk.delete). */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $risk = Risk::find($id);
        if (! $risk) {
            return $this->error('Không tìm thấy Rủi ro.', 404);
        }

        $risk->delete();
        $this->log($user->id, 'delete', $id);

        return response()->json(['status' => 'ok']);
    }

    /**
     * Rule validate: store (required) hoặc update (sometimes).
     * KHÔNG có riskScore/riskLevel – backend tự tính (AC-17).
     */
    private function rules(bool $partial = false, ?int $ignoreId = null): array
    {
        $req = $partial ? 'sometimes' : 'required';
        $catKeys = implode(',', array_keys(RiskSupport::CATEGORIES));
        $freqKeys = implode(',', RiskSupport::REVIEW_FREQUENCIES);

        return [
            // code optional khi tạo (backend tự sinh RISK-### nếu client không gửi).
            'code' => $partial
                ? ['sometimes', 'string', 'max:30', Rule::unique('risks', 'code')->ignore($ignoreId)]
                : ['nullable', 'string', 'max:30', Rule::unique('risks', 'code')],
            'sourceType' => [$req, 'string', 'in:'.implode(',', RiskSupport::SOURCE_TYPES)],
            'category' => ['nullable', 'string', 'in:'.$catKeys],
            'objective' => ['nullable', 'string', 'max:250'],
            'description' => ['nullable', 'string'],
            'likelihood' => [$req, 'integer', 'min:1', 'max:5'],
            'impact' => [$req, 'integer', 'min:1', 'max:5'],
            'treatment' => ['nullable', 'string'],
            'expectedResult' => ['nullable', 'string'],
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

        return $codes->contains('dept_manager') && ! $permissions->contains('risk.create');
    }

    private function log(int $userId, string $action, int $entityId, ?string $old = null, ?string $new = null): void
    {
        ActivityLog::create([
            'user_id' => $userId,
            'action' => $action,
            'entity' => LogEntity::Risk->value,
            'entity_id' => $entityId,
            'old_status' => $old,
            'new_status' => $new,
        ]);
    }

    private function error(string $message, int $code): JsonResponse
    {
        return response()->json(['status' => 'error', 'message' => $message], $code);
    }
}
