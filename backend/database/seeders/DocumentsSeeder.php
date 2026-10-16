<?php

namespace Database\Seeders;

use App\Models\Document;
use App\Models\DocumentApproval;
use App\Models\DocumentVersion;
use Illuminate\Database\Seeder;

/** Fixtures 8 documents + versions + approvals – khớp mock/seed.ts */
class DocumentsSeeder extends Seeder
{
    public function run(): void
    {
        $docs = [
            ['id' => 1, 'code' => 'QT-HCNS.01', 'name' => 'Quy trình quản lý nhân sự', 'docType' => 'procedure', 'departmentId' => 3, 'ownerId' => 5, 'currentVersion' => 'V1.2', 'status' => 'published', 'workflowStep' => 5],
            ['id' => 2, 'code' => 'QT-HCNS.02', 'name' => 'Quy trình đào tạo và phát triển', 'docType' => 'procedure', 'departmentId' => 3, 'ownerId' => 5, 'currentVersion' => 'V0.1', 'status' => 'draft', 'workflowStep' => 1, 'relatedTaskId' => 5],
            ['id' => 3, 'code' => 'QT-KD.01', 'name' => 'Quy trình bán hàng và ký hợp đồng', 'docType' => 'procedure', 'departmentId' => 4, 'ownerId' => 5, 'currentVersion' => 'V1.0', 'status' => 'reviewing', 'workflowStep' => 3, 'relatedTaskId' => 6],
            ['id' => 4, 'code' => 'QT-KD.02', 'name' => 'Quy trình xử lý khiếu nại khách hàng', 'docType' => 'procedure', 'departmentId' => 4, 'ownerId' => 5, 'currentVersion' => 'V0.2', 'status' => 'approval_pending', 'workflowStep' => 4, 'relatedTaskId' => 6],
            ['id' => 5, 'code' => 'QT-BCN.01', 'name' => 'Sổ tay chất lượng (QMS Manual)', 'docType' => 'manual', 'departmentId' => 2, 'ownerId' => 3, 'currentVersion' => 'V2.0', 'status' => 'draft', 'workflowStep' => 1, 'relatedTaskId' => 7],
            ['id' => 6, 'code' => 'CQT-KD.01', 'name' => 'Biểu mẫu: Phiếu báo giá', 'docType' => 'form', 'departmentId' => 4, 'ownerId' => 5, 'currentVersion' => 'V1.0', 'status' => 'published', 'workflowStep' => 5, 'effectiveDate' => '2026-01-01'],
            ['id' => 7, 'code' => 'QT-KT.01', 'name' => 'Quy trình kiểm tra sản phẩm', 'docType' => 'procedure', 'departmentId' => 5, 'ownerId' => 5, 'currentVersion' => 'V0.3', 'status' => 'approval_pending', 'workflowStep' => 4, 'relatedTaskId' => 8],
            ['id' => 8, 'code' => 'QTCB.01', 'name' => 'Chính sách chất lượng', 'docType' => 'policy', 'departmentId' => 2, 'ownerId' => 3, 'currentVersion' => 'V1.0', 'status' => 'published', 'workflowStep' => 5, 'effectiveDate' => '2026-01-01'],
        ];

        foreach ($docs as $d) {
            Document::updateOrCreate(['id' => $d['id']], [
                'code' => $d['code'], 'name' => $d['name'], 'doc_type' => $d['docType'],
                'department_id' => $d['departmentId'], 'owner_id' => $d['ownerId'],
                'current_version' => $d['currentVersion'], 'status' => $d['status'],
                'workflow_step' => $d['workflowStep'],
                'related_task_id' => $d['relatedTaskId'] ?? null,
                'effective_date' => $d['effectiveDate'] ?? null,
            ]);
        }

        $versions = [
            ['id' => 1, 'document_id' => 1, 'version' => 'V1.0', 'changeSummary' => 'Ban hành đầu tiên', 'createdBy' => 5, 'createdAt' => '2025-10-02', 'approvedBy' => 2, 'approvedAt' => '2025-10-20', 'isCurrent' => false],
            ['id' => 2, 'document_id' => 1, 'version' => 'V1.1', 'changeSummary' => 'Bổ sung quy trình thử việc', 'createdBy' => 5, 'createdAt' => '2025-11-02', 'approvedBy' => 2, 'approvedAt' => '2025-11-20', 'isCurrent' => false],
            ['id' => 3, 'document_id' => 1, 'version' => 'V1.2', 'changeSummary' => 'Cập nhật theo luật lao động 2026', 'createdBy' => 5, 'createdAt' => '2026-05-02', 'approvedBy' => 2, 'approvedAt' => '2026-05-25', 'isCurrent' => true],
            ['id' => 4, 'document_id' => 2, 'version' => 'V0.1', 'changeSummary' => 'Dự thảo đầu tiên', 'createdBy' => 5, 'createdAt' => '2026-10-06', 'isCurrent' => true],
            ['id' => 5, 'document_id' => 3, 'version' => 'V1.0', 'changeSummary' => 'Soạn thảo theo kế hoạch 2027', 'createdBy' => 5, 'createdAt' => '2026-10-07', 'isCurrent' => true],
            ['id' => 6, 'document_id' => 4, 'version' => 'V0.2', 'changeSummary' => 'Cập nhật theo góp ý KD', 'createdBy' => 5, 'createdAt' => '2026-10-02', 'isCurrent' => true],
            ['id' => 7, 'document_id' => 5, 'version' => 'V1.0', 'changeSummary' => 'Phiên bản cũ', 'createdBy' => 3, 'createdAt' => '2024-08-01', 'approvedBy' => 2, 'approvedAt' => '2024-08-20', 'isCurrent' => false],
            ['id' => 8, 'document_id' => 5, 'version' => 'V2.0', 'changeSummary' => 'Dự thảo chu kỳ 2026–2027', 'createdBy' => 3, 'createdAt' => '2026-10-08', 'isCurrent' => true],
            ['id' => 9, 'document_id' => 6, 'version' => 'V1.0', 'changeSummary' => 'Ban hành', 'createdBy' => 5, 'createdAt' => '2025-12-10', 'approvedBy' => 2, 'approvedAt' => '2025-12-25', 'isCurrent' => true],
            ['id' => 10, 'document_id' => 7, 'version' => 'V0.3', 'changeSummary' => 'Bổ sung AQL', 'createdBy' => 5, 'createdAt' => '2026-10-04', 'isCurrent' => true],
            ['id' => 11, 'document_id' => 8, 'version' => 'V1.0', 'changeSummary' => 'Ban hành đầu tiên', 'createdBy' => 3, 'createdAt' => '2025-12-01', 'approvedBy' => 2, 'approvedAt' => '2025-12-20', 'isCurrent' => true],
        ];

        foreach ($versions as $v) {
            DocumentVersion::updateOrCreate(['id' => $v['id']], [
                'document_id' => $v['document_id'], 'version' => $v['version'],
                'change_summary' => $v['changeSummary'], 'created_by' => $v['createdBy'],
                'created_at' => $v['createdAt'], 'approved_by' => $v['approvedBy'] ?? null,
                'approved_at' => $v['approvedAt'] ?? null, 'is_current' => $v['isCurrent'],
            ]);
        }

        $approvals = [
            ['id' => 1, 'document_id' => 1, 'version' => 'V1.2', 'step' => 'reviewing', 'approver_id' => 3, 'action' => 'review', 'comment' => 'Hợp lý', 'decided_at' => '2026-05-10'],
            ['id' => 2, 'document_id' => 1, 'version' => 'V1.2', 'step' => 'approval_pending', 'approver_id' => 2, 'action' => 'approve', 'comment' => 'Đồng ý ban hành', 'decided_at' => '2026-05-20'],
            ['id' => 3, 'document_id' => 1, 'version' => 'V1.2', 'step' => 'published', 'approver_id' => 2, 'action' => 'publish', 'comment' => null, 'decided_at' => '2026-06-01'],
            ['id' => 4, 'document_id' => 3, 'version' => 'V1.0', 'step' => 'draft', 'approver_id' => 5, 'action' => 'submit', 'comment' => 'Trình thẩm định', 'decided_at' => '2026-10-07'],
            ['id' => 5, 'document_id' => 4, 'version' => 'V0.2', 'step' => 'reviewing', 'approver_id' => 3, 'action' => 'review', 'comment' => 'Đã thẩm định', 'decided_at' => '2026-10-05'],
            ['id' => 6, 'document_id' => 4, 'version' => 'V0.2', 'step' => 'approval_pending', 'approver_id' => 5, 'action' => 'submit', 'comment' => 'Trình phê duyệt', 'decided_at' => '2026-10-06'],
            ['id' => 7, 'document_id' => 6, 'version' => 'V1.0', 'step' => 'approval_pending', 'approver_id' => 2, 'action' => 'approve', 'comment' => null, 'decided_at' => '2025-12-25'],
            ['id' => 8, 'document_id' => 7, 'version' => 'V0.3', 'step' => 'reviewing', 'approver_id' => 6, 'action' => 'review', 'comment' => 'Đã kiểm tra', 'decided_at' => '2026-10-06'],
            ['id' => 9, 'document_id' => 8, 'version' => 'V1.0', 'step' => 'approval_pending', 'approver_id' => 2, 'action' => 'approve', 'comment' => null, 'decided_at' => '2025-12-20'],
        ];

        foreach ($approvals as $a) {
            $id = $a['id'];
            unset($a['id']);
            DocumentApproval::updateOrCreate(['id' => $id], $a);
        }
    }
}
