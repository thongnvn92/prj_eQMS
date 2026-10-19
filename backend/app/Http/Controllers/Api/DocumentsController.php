<?php

namespace App\Http\Controllers\Api;

use App\Enums\LogEntity;
use App\Http\Controllers\Controller;
use App\Http\Resources\DocumentFileResource;
use App\Http\Resources\DocumentResource;
use App\Models\ActivityLog;
use App\Models\Document;
use App\Models\DocumentFile;
use App\Models\DocumentVersion;
use App\Models\File;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class DocumentsController extends Controller
{
    /**
     * GET /documents – trả DocumentResource[] (camelCase, kèm versions[]/approvals[]/files[]).
     * Hỗ trợ query: ?departmentId=, ?status=, ?docType=, ?keyword=, ?sortBy=&sortOrder=.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Document::with(['department', 'owner', 'versions', 'approvals', 'files.file']);

        if ($request->filled('departmentId')) {
            $query->where('department_id', $request->integer('departmentId'));
        }
        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('docType')) {
            $query->where('doc_type', $request->string('docType'));
        }
        if ($request->filled('keyword')) {
            $kw = $request->string('keyword');
            $query->where(function ($q) use ($kw) {
                $q->where('code', 'like', "%{$kw}%")->orWhere('name', 'like', "%{$kw}%");
            });
        }

        // Sort an toàn theo whitelist cột.
        $sortMap = [
            'code' => 'code', 'name' => 'name', 'status' => 'status',
            'docType' => 'doc_type', 'currentVersion' => 'current_version',
            'createdAt' => 'created_at', 'statusUpdatedAt' => 'status_updated_at',
            'effectiveDate' => 'effective_date',
        ];
        $sortBy = $sortMap[$request->string('sortBy')->toString()] ?? 'code';
        $sortOrder = strtolower($request->string('sortOrder')->toString()) === 'desc' ? 'desc' : 'asc';
        $query->orderBy($sortBy, $sortOrder);

        $docs = $query->get();

        // Trả MẢNG trực tiếp (không bọc { data }) để khớp contract mock FE.
        return response()->json(DocumentResource::collection($docs));
    }

    /**
     * POST /documents/{id}/transition?action=..&comment=..
     * Workflow tài liệu: draft→reviewing→approval_pending→approved→published (kèm reject).
     * Trả DocumentResource (camelCase).
     */
    public function transition(Request $request, int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $doc = Document::with(['versions', 'approvals'])->find($id);
        if (! $doc) {
            return $this->error('Không tìm thấy tài liệu.', 404);
        }

        $data = $request->validate([
            'action' => ['required', 'string', 'in:submit,review,approve,reject,publish'],
            'comment' => ['nullable', 'string'],
        ]);
        $action = $data['action'];
        $comment = $data['comment'] ?? null;

        // Quyền theo TỪNG transition.
        $permMap = [
            'submit' => 'document.submit',
            'review' => 'document.review',
            'approve' => 'document.approve',
            'reject' => 'document.approve',
            'publish' => 'document.publish',
        ];
        $permissions = $user->roles->flatMap->permissions->pluck('code');
        if (! $permissions->contains($permMap[$action])) {
            return $this->error('Bạn không có quyền thực hiện thao tác này.', 403);
        }

        // State machine.
        $transitions = [
            'draft' => ['submit' => 'reviewing'],
            'reviewing' => ['review' => 'approval_pending', 'reject' => 'draft'],
            'approval_pending' => ['approve' => 'approved', 'reject' => 'draft'],
            'approved' => ['publish' => 'published'],
        ];
        if (! isset($transitions[$doc->status][$action])) {
            return $this->error('Không thể thực hiện thao tác tại trạng thái hiện tại.', 409);
        }
        if ($action === 'reject' && ! trim((string) $comment)) {
            return $this->error('Bắt buộc nhập lý do từ chối (comment).', 400);
        }

        $oldStatus = $doc->status;
        $doc->status = $transitions[$doc->status][$action];
        $doc->status_updated_at = now();

        // Ban hành lần đầu: V0.x -> V1.0.
        if ($action === 'publish') {
            $cur = $doc->versions->firstWhere('is_current', true);
            if ($doc->current_version !== null && str_starts_with((string) $doc->current_version, 'V0.')) {
                if ($cur) {
                    $cur->update(['is_current' => false]);
                }
                $newVersion = DocumentVersion::create([
                    'document_id' => $doc->id,
                    'version' => 'V1.0',
                    'change_summary' => 'Ban hành lần đầu',
                    'created_by' => $user->id,
                    'approved_by' => $user->id,
                    'approved_at' => now(),
                    'is_current' => true,
                ]);
                $doc->current_version = 'V1.0';
            } elseif ($cur) {
                $cur->update(['approved_by' => $user->id, 'approved_at' => now()]);
            }
            $doc->effective_date = now();
        }

        $doc->save();

        // Ghi nhận phê duyệt + activity log.
        $doc->approvals()->create([
            'version' => $doc->current_version,
            'step' => $doc->status,
            'approver_id' => $user->id,
            'action' => $action,
            'comment' => $comment,
            'decided_at' => now(),
        ]);
        ActivityLog::create([
            'user_id' => $user->id,
            'action' => $action,
            'entity' => LogEntity::Document->value,
            'entity_id' => $doc->id,
            'old_status' => $oldStatus,
            'new_status' => $doc->status,
        ]);

        // Trả object trực tiếp (không bọc { data }) để khớp contract mock FE.
        return response()->json(new DocumentResource($doc->fresh(['versions', 'approvals', 'files.file'])));
    }

    /**
     * POST /documents – tạo tài liệu mới (draft).
     * Quyền: document.create (Ban ISO: leader/deputy/member/coordinator + document_owner + super_admin).
     * Tạo Document (status=draft, workflow_step=1) + DocumentVersion V0.1 đầu tiên + activity log.
     */
    public function store(Request $request): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $data = $request->validate([
            'code' => ['required', 'string', 'max:50', 'unique:documents,code'],
            'name' => ['required', 'string', 'max:250'],
            'docType' => ['required', 'string', 'in:policy,manual,regulation,procedure,work_instruction,form,record,standard'],
            'departmentId' => ['nullable', 'integer', 'exists:departments,id'],
            'ownerId' => ['nullable', 'integer', 'exists:users,id'],
            'relatedTaskId' => ['nullable', 'integer', 'exists:master_plan_tasks,id'],
            'description' => ['nullable', 'string'],
            'changeSummary' => ['nullable', 'string'],
            'autoVersion' => ['sometimes', 'boolean'],
        ]);

        $doc = Document::create([
            'code' => $data['code'],
            'name' => $data['name'],
            'doc_type' => $data['docType'],
            'department_id' => $data['departmentId'] ?? $user->department_id,
            'owner_id' => $data['ownerId'] ?? $user->id,
            'current_version' => 'V0.1',
            'status' => 'draft',
            'workflow_step' => 1,
            'auto_version' => $data['autoVersion'] ?? true,
            'related_task_id' => $data['relatedTaskId'] ?? null,
            'description' => $data['description'] ?? null,
        ]);

        $doc->versions()->create([
            'version' => 'V0.1',
            'change_summary' => $data['changeSummary'] ?? 'Dự thảo đầu tiên',
            'created_by' => $user->id,
            'is_current' => true,
        ]);

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'create',
            'entity' => LogEntity::Document->value,
            'entity_id' => $doc->id,
            'old_status' => null,
            'new_status' => 'draft',
        ]);

        return response()->json(new DocumentResource($doc->fresh(['versions', 'approvals', 'files.file'])), 201);
    }

    /**
     * POST /documents/import – import hàng loạt tài liệu (FE CSV gửi 1 lần duy nhất).
     * Body: { rows: [{ line?, code, name, docType, departmentId?, ownerId?, description? }] }
     * Hiệu năng: pre-load id + mã đã tồn tại, validate từng dòng thuần PHP (0 query/dòng),
     * insert documents + document_versions (V0.1) + activity log hàng loạt trong 1 transaction.
     * Partial import: { imported, errors: [{ index, line, message }] }. Mặc định như store:
     * department/owner fallback theo người tạo, status=draft, workflow_step=1, auto_version=true.
     */
    public function importDocuments(Request $request): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $payload = $request->validate([
            'rows' => ['required', 'array', 'min:1', 'max:1000'],
        ]);

        $deptIds = DB::table('departments')->pluck('id')->flip();
        $userIds = DB::table('users')->pluck('id')->flip();
        $batchCodes = array_values(array_unique(array_filter(array_map(
            static fn ($r) => is_array($r) ? strtolower(trim((string) ($r['code'] ?? ''))) : '',
            $payload['rows'],
        ), static fn ($c) => $c !== '')));
        $existingCodes = $batchCodes === []
            ? []
            : array_map('strtolower', DB::table('documents')->whereIn('code', $batchCodes)->pluck('code')->all());
        $existingSet = array_flip($existingCodes);

        $valid = [];
        $errors = [];
        $seen = [];
        foreach ($payload['rows'] as $index => $row) {
            $normalized = $this->validateImportDocumentRow(is_array($row) ? $row : [], $deptIds, $userIds, $user->id, $existingSet, $seen);
            if (is_string($normalized)) {
                $line = is_array($row) && isset($row['line']) && is_numeric($row['line']) ? (int) $row['line'] : null;
                $errors[] = ['index' => $index, 'line' => $line, 'message' => $normalized];

                continue;
            }
            $seen[strtolower($normalized['code'])] = true;
            $valid[] = $normalized;
        }

        if ($valid !== []) {
            $now = now();
            DB::transaction(function () use ($valid, $user, $now) {
                $beforeId = (int) (Document::max('id') ?? 0);
                $insertRows = array_map(static fn (array $v) => $v + ['created_at' => $now, 'updated_at' => $now], $valid);
                foreach (array_chunk($insertRows, 500) as $chunk) {
                    Document::insert($chunk);
                }
                $docs = Document::where('id', '>', $beforeId)->orderBy('id')->get(['id']);
                $versionRows = [];
                $logRows = [];
                foreach ($docs as $doc) {
                    $versionRows[] = [
                        'document_id' => $doc->id,
                        'version' => 'V0.1',
                        'change_summary' => 'Dự thảo đầu tiên',
                        'created_by' => $user->id,
                        'is_current' => true,
                        'created_at' => $now,
                        'updated_at' => $now,
                    ];
                    $logRows[] = [
                        'user_id' => $user->id,
                        'action' => 'create',
                        'entity' => LogEntity::Document->value,
                        'entity_id' => $doc->id,
                        'new_status' => 'draft',
                    ];
                }
                foreach (array_chunk($versionRows, 500) as $chunk) {
                    DocumentVersion::insert($chunk);
                }
                if ($logRows !== []) {
                    ActivityLog::insert($logRows);
                }
            });
        }

        return response()->json(['imported' => count($valid), 'errors' => $errors]);
    }

    /** Validate + normalize 1 dòng import tài liệu; trả message lỗi (string) hoặc row snake_case đã chốt (array). */
    private function validateImportDocumentRow(array $row, $deptIds, $userIds, int $userId, array $existingCodes, array $seen): string|array
    {
        $code = trim((string) ($row['code'] ?? ''));
        if ($code === '') {
            return 'Thiếu code.';
        }
        if (mb_strlen($code) > 50) {
            return 'code tối đa 50 ký tự.';
        }
        $codeKey = strtolower($code);
        if (isset($seen[$codeKey])) {
            return "Mã \"{$code}\" bị trùng trong file.";
        }
        if (isset($existingCodes[$codeKey])) {
            return "Mã \"{$code}\" đã tồn tại trong hệ thống.";
        }
        $name = trim((string) ($row['name'] ?? ''));
        if ($name === '') {
            return 'Thiếu name.';
        }
        if (mb_strlen($name) > 250) {
            return 'name tối đa 250 ký tự.';
        }
        $docType = trim((string) ($row['docType'] ?? ''));
        if (! in_array($docType, ['policy', 'manual', 'regulation', 'procedure', 'work_instruction', 'form', 'record', 'standard'], true)) {
            return 'docType không hợp lệ.';
        }
        $departmentId = $row['departmentId'] ?? null;
        if ($departmentId !== null && $departmentId !== '' && (! is_numeric($departmentId) || ! $deptIds->has((int) $departmentId))) {
            return 'departmentId không tồn tại.';
        }
        $ownerId = $row['ownerId'] ?? null;
        if ($ownerId !== null && $ownerId !== '' && (! is_numeric($ownerId) || ! $userIds->has((int) $ownerId))) {
            return 'ownerId không tồn tại.';
        }

        return [
            'code' => $code,
            'name' => $name,
            'doc_type' => $docType,
            'department_id' => $departmentId === null || $departmentId === '' ? null : (int) $departmentId,
            'owner_id' => $ownerId === null || $ownerId === '' ? $userId : (int) $ownerId,
            'current_version' => 'V0.1',
            'status' => 'draft',
            'workflow_step' => 1,
            'auto_version' => true,
            'related_task_id' => null,
            'description' => trim((string) ($row['description'] ?? '')) ?: null,
        ];
    }

    /**
     * PATCH /documents/{id} – sửa metadata tài liệu đang ở draft.
     * Quyền: document.update. Chỉ sửa khi status=draft (không overwrite version đã ban hành);
     * đổi nội dung version hiện hành → tạo version nháp mới (V0.x+1) thay vì sửa trực tiếp.
     */
    public function update(Request $request, int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $doc = Document::with(['versions', 'approvals'])->find($id);
        if (! $doc) {
            return $this->error('Không tìm thấy tài liệu.', 404);
        }
        if ($doc->status !== 'draft') {
            return $this->error('Chỉ được sửa tài liệu ở trạng thái dự thảo (draft).', 409);
        }

        $data = $request->validate([
            'code' => ['sometimes', 'string', 'max:50', 'unique:documents,code,'.$doc->id],
            'name' => ['sometimes', 'string', 'max:250'],
            'docType' => ['sometimes', 'string', 'in:policy,manual,regulation,procedure,work_instruction,form,record,standard'],
            'departmentId' => ['nullable', 'integer', 'exists:departments,id'],
            'ownerId' => ['nullable', 'integer', 'exists:users,id'],
            'relatedTaskId' => ['nullable', 'integer', 'exists:master_plan_tasks,id'],
            'description' => ['nullable', 'string'],
            'changeSummary' => ['nullable', 'string'],
            'autoVersion' => ['sometimes', 'boolean'],
            'version' => ['sometimes', 'nullable', 'string', 'max:20'],
        ]);

        $map = [
            'code' => 'code', 'name' => 'name', 'docType' => 'doc_type',
            'departmentId' => 'department_id', 'ownerId' => 'owner_id',
            'relatedTaskId' => 'related_task_id', 'description' => 'description',
            'autoVersion' => 'auto_version',
        ];
        foreach ($map as $in => $col) {
            if (array_key_exists($in, $data)) {
                $doc->{$col} = $data[$in];
            }
        }
        $doc->save();

        // Ghi nhận lần sửa dưới dạng version mới (không overwrite version hiện hành).
        // Tích auto-version → hệ thống tự tăng (V0.2, V0.3...); bỏ tích → dùng version nhập tay
        // (bắt buộc nhập, không được trùng version đã có).
        $hasVersionChange = array_key_exists('changeSummary', $data)
            || array_key_exists('name', $data)
            || array_key_exists('version', $data);
        if ($hasVersionChange) {
            $autoVersion = array_key_exists('autoVersion', $data)
                ? (bool) $data['autoVersion']
                : (bool) $doc->auto_version;
            $cur = $doc->versions->firstWhere('is_current', true);
            if ($autoVersion) {
                $next = 'V0.'.((int) preg_replace('/^V0\./', '', (string) ($cur->version ?? 'V0.0')) + 1);
            } else {
                $next = trim((string) ($data['version'] ?? ''));
                if ($next === '') {
                    return $this->error('Vui lòng nhập số version khi tắt tự động đánh version.', 422);
                }
                if ($doc->versions->contains('version', $next)) {
                    return $this->error("Version \"{$next}\" đã tồn tại cho tài liệu này.", 409);
                }
            }
            if ($cur) {
                $cur->update(['is_current' => false]);
            }
            $doc->versions()->create([
                'version' => $next,
                'change_summary' => $data['changeSummary'] ?? 'Cập nhật dự thảo',
                'created_by' => $user->id,
                'is_current' => true,
            ]);
            $doc->update(['current_version' => $next]);
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'update',
            'entity' => LogEntity::Document->value,
            'entity_id' => $doc->id,
            'old_status' => 'draft',
            'new_status' => 'draft',
        ]);

        return response()->json(new DocumentResource($doc->fresh(['versions', 'approvals', 'files.file'])));
    }

    /**
     * GET /documents/{id}/files – danh sách file đính kèm (mọi revision).
     * Quyền: document.view (ai xem được tài liệu đều thấy/tải được file).
     */
    public function files(Request $request, int $id): JsonResponse
    {
        $doc = Document::find($id);
        if (! $doc) {
            return $this->error('Không tìm thấy tài liệu.', 404);
        }

        $files = DocumentFile::with('file')
            ->where('document_id', $id)
            ->orderBy('revision', 'desc')
            ->get();

        return response()->json(DocumentFileResource::collection($files));
    }

    /**
     * POST /documents/{id}/files – upload NHIỀU file đính kèm (multipart, tối đa 10 file/lần).
     * Quyền: document.update hoặc document.create.
     * Mỗi file tạo 1 revision mới (revision = max+1 trong version), không ghi đè bản cũ.
     * Trả về DocumentFileResource[] (mảng các file vừa upload).
     */
    public function uploadFile(Request $request, int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $doc = Document::with('versions')->find($id);
        if (! $doc) {
            return $this->error('Không tìm thấy tài liệu.', 404);
        }

        $data = $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:10'],
            'files.*' => ['file', 'max:51200', 'mimes:pdf,doc,docx,xls,xlsx,ppt,pptx,txt,csv,png,jpg,jpeg,zip'],
            'changeNote' => ['nullable', 'string', 'max:500'],
        ]);

        $currentVersion = $doc->versions->firstWhere('is_current', true);
        $scope = $currentVersion?->id;
        $nextRev = (int) (DocumentFile::where('document_version_id', $scope)->max('revision') ?? 0);

        $created = [];
        foreach ($request->file('files') as $uploaded) {
            // Lưu file vật lý trên disk private (chỉ truy cập qua controller có auth).
            $stored = $uploaded->store('documents/'.$id, 'local');

            $file = File::create([
                'disk' => 'local',
                'path' => $stored,
                'original_name' => $uploaded->getClientOriginalName(),
                'mime_type' => $uploaded->getClientMimeType(),
                'size' => $uploaded->getSize(),
                'uploaded_by' => $user->id,
            ]);

            $nextRev++;
            $created[] = DocumentFile::create([
                'document_id' => $id,
                'document_version_id' => $scope,
                'file_id' => $file->id,
                'revision' => $nextRev,
                'change_note' => $data['changeNote'] ?? null,
                'created_by' => $user->id,
            ]);
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'upload',
            'entity' => LogEntity::Document->value,
            'entity_id' => $id,
            'old_status' => null,
            'new_status' => null,
        ]);

        return response()->json(DocumentFileResource::collection(collect($created)->each->load('file')), 201);
    }

    /**
     * GET /documents/files/{documentFileId}/download – tải/xem file.
     * Quyền: document.view. PDF mở inline (xem trực tiếp), file khác tải về (attachment).
     */
    public function downloadFile(int $documentFileId)
    {
        $docFile = DocumentFile::with('file')->find($documentFileId);
        if (! $docFile || ! $docFile->file) {
            return response()->json(['status' => 'error', 'message' => 'Không tìm thấy tệp tin.'], 404);
        }

        $disk = Storage::disk($docFile->file->disk);
        $name = $docFile->file->original_name;
        $isPdf = $docFile->file->mime_type === 'application/pdf'
            || str_ends_with(strtolower($name), '.pdf');

        $disposition = $isPdf ? 'inline' : 'attachment';

        return response()->streamDownload(
            function () use ($disk, $docFile) {
                $stream = $disk->readStream($docFile->file->path);
                if ($stream === false) {
                    return;
                }
                fpassthru($stream);
                @fclose($stream);
            },
            $name,
            [
                'Content-Type' => $docFile->file->mime_type ?: 'application/octet-stream',
                'X-Content-Type-Options' => 'nosniff',
            ],
            $disposition,
        );
    }

    /**
     * POST /documents/{id}/new-version – nâng cấp version & bắt đầu lại workflow để phát hành phiên bản mới.
     * Chỉ áp dụng cho tài liệu đã published. Tạo version mới, reset trạng thái về draft,
     * giữ nguyên lịch sử version & phê duyệt cũ. Quyền: document.create hoặc document.update.
     */
    public function newVersion(Request $request, int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $doc = Document::with('versions')->find($id);
        if (! $doc) {
            return $this->error('Không tìm thấy tài liệu.', 404);
        }
        if ($doc->status !== 'published') {
            return $this->error('Chỉ tạo phiên bản mới cho tài liệu đã ban hành (published).', 409);
        }

        $data = $request->validate([
            'version' => ['nullable', 'string', 'max:20'],
            'changeSummary' => ['nullable', 'string'],
        ]);

        if ($doc->auto_version) {
            $newVersion = $this->nextMajorVersion((string) $doc->current_version);
        } else {
            $newVersion = $data['version'] ?? null;
            if (! $newVersion) {
                return $this->error('Vui lòng nhập số version khi tắt tự động đánh version.', 422);
            }
        }

        $cur = $doc->versions->firstWhere('is_current', true);
        if ($cur) {
            $cur->update(['is_current' => false]);
        }

        $doc->versions()->create([
            'version' => $newVersion,
            'change_summary' => $data['changeSummary'] ?? "Tạo phiên bản {$newVersion}",
            'created_by' => $user->id,
            'is_current' => true,
        ]);
        $doc->update([
            'current_version' => $newVersion,
            'status' => 'draft',
            'workflow_step' => 1,
            'status_updated_at' => now(),
        ]);

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'new_version',
            'entity' => LogEntity::Document->value,
            'entity_id' => $doc->id,
            'old_status' => 'published',
            'new_status' => 'draft',
        ]);

        return response()->json(new DocumentResource($doc->fresh(['versions', 'approvals', 'files.file'])));
    }

    /** PATCH /documents/{id}/auto-version – bật/tắt tự động đánh version. Quyền: document.update. */
    public function toggleAutoVersion(Request $request, int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $doc = Document::find($id);
        if (! $doc) {
            return $this->error('Không tìm thấy tài liệu.', 404);
        }

        $data = $request->validate(['autoVersion' => ['required', 'boolean']]);
        $doc->update(['auto_version' => $data['autoVersion']]);

        return response()->json(new DocumentResource($doc->fresh(['versions', 'approvals', 'files.file'])));
    }

    /**
     * DELETE /documents/{id} – xóa tài liệu. Quyền: document.delete.
     * Chặn tài liệu đã ban hành (published) → 409 (không xóa record ISO đã hiệu lực).
     * versions/approvals/document_files cascade theo FK; dọn file vật lý + bản ghi File kèm theo.
     */
    public function destroy(int $id): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        if (! $user) {
            return $this->error('Phiên đăng nhập không hợp lệ.', 401);
        }

        $doc = Document::with('files.file')->find($id);
        if (! $doc) {
            return $this->error('Không tìm thấy tài liệu.', 404);
        }
        if ($doc->status === 'published') {
            return $this->error('Không thể xóa tài liệu đã ban hành (published). Hãy chuyển sang obsolete/archived trước.', 409);
        }

        $oldStatus = (string) $doc->status;
        $files = $doc->files->map->file->filter()->values();

        $doc->delete(); // DB cascade: document_versions / document_approvals / document_files.

        // Dọn file vật lý + bản ghi File (FK document_versions.action_evidences xử lý null/cascade).
        foreach ($files as $file) {
            Storage::disk($file->disk)->delete($file->path);
            $file->delete();
        }

        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'delete',
            'entity' => LogEntity::Document->value,
            'entity_id' => $id,
            'old_status' => $oldStatus,
            'new_status' => null,
        ]);

        return response()->json(['status' => 'ok']);
    }

    /** Tăng bậc lớn: V1.0 -> V2.0 ; V2.3 -> V3.0 (lấy số nguyên đầu +1). */
    private function nextMajorVersion(string $current): string
    {
        if (preg_match('/V?(\d+)/', $current, $m)) {
            return 'V'.((int) $m[1] + 1).'.0';
        }

        return 'V1.0';
    }

    private function error(string $message, int $code): JsonResponse
    {
        return response()->json(['status' => 'error', 'message' => $message], $code);
    }
}
