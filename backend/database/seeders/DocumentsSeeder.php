<?php

namespace Database\Seeders;

use App\Models\Document;
use App\Models\DocumentApproval;
use App\Models\DocumentFile;
use App\Models\DocumentVersion;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Seed 111 tài liệu ISO từ bảng theo dõi tài liệu của Ban ISO (Q4/2026 – Q4/2027).
 *
 * Nguồn dữ liệu (bảng do Ban ISO cung cấp): STT / Mã tài liệu / Tên tài liệu /
 * Phòng phụ trách / Người biên soạn / Vòng xử lý (B1–B5, Ph-) / Ngày dự kiến
 * hoàn thành / Trạng thái (Not started, In progress, Pending, Delayed, Done).
 *
 * Id gán theo hợp đồng test (giữ nguyên fixtures cũ – xem DocumentDeleteTest,
 * DocumentVersionTest, EndpointWorkflowTest...):
 *   1 = published (QT-HCNS.05), 2 = draft V0.1 (QT-HCNS.02), 3 = reviewing
 *   (QT-BISO.01), 4 = approval_pending V0.3 (QT-HCNS.01), 5 = draft
 *   (QC-BALD.01), 8 = published V1.0 (QT-HCNS.06). 8 mã lead lấy trước theo
 *   thứ tự trên; các dòng còn lại giữ thứ tự STT (với STT >= 15 thì id = STT).
 *   GET /documents mặc định sort theo `code` nên hiển thị không phụ thuộc id.
 *
 * Ánh xạ:
 * - docType theo tiền tố mã: ST->manual, QT->procedure, HD->work_instruction,
 *   TC->standard, QC/QĐ->regulation.
 * - status/workflow_step theo Trạng thái + vòng xử lý (statusStep()).
 * - Cột không có trong schema (Vòng xử lý, Ngày dự kiến hoàn thành, Trạng thái
 *   kế hoạch) -> ghi vào description; cột "% HT" để trống.
 * - related_task_id/effective_date để null (chưa có dữ liệu tương ứng).
 *
 * Idempotent: updateOrCreate theo id; versions/approvals/document_files của các
 * tài liệu fixture được dọn rồi seed lại để không còn bản ghi mồ côi.
 */
class DocumentsSeeder extends Seeder
{
    /** "Người biên soạn" (bảng theo dõi) -> username (xem UsersSeeder + docs/demo-accounts.md). */
    private const AUTHORS = [
        'Phạm Hạnh' => 'phamhanh',
        'Châu Loan' => 'chauloan',
        'Minh Hằng' => 'minhhang',
        'M.Hằng+P.Hạnh' => 'minhhang', // gộp 2 người -> gán owner là Minh Hằng
        'Mỹ Hương' => 'myhuong',
        'Hồng Thơm' => 'hongthom',
        'Khải Hoàng' => 'khaihoang',
        'Thái Bình' => 'thaibinh',
        'Minh Tuân' => 'minhtuan',
        'Thùy Trang' => 'thuytrang',
        'Thu Thủy' => 'thuthuy',
        'Tấn Vệ' => 'tanve',
        'Hoàng Huy' => 'hoanghuy',
    ];

    /** Cột "Phòng phụ trách" -> id phòng (DepartmentsSeeder). */
    private const DEPARTMENTS = [
        'Ban ISO' => 2,
        'P.HCNS' => 3,
        'P.KD' => 4,
        'P. TCKT' => 7,
        'P.KTSX' => 8,
    ];

    /** 8 mã lấy trước để giữ id fixture của test (xem docblock). */
    private const LEAD_CODES = [
        'QT-HCNS.05', 'QT-HCNS.02', 'QT-BISO.01', 'QT-HCNS.01',
        'QC-BALD.01', 'QT-BALĐ.01', 'ST-BISO.01', 'QT-HCNS.06',
    ];

    public function run(): void
    {
        $userIds = User::whereIn('username', array_unique(self::AUTHORS))->pluck('id', 'username');
        $ownerIdOf = static function (string $author) use ($userIds): ?int {
            $username = self::AUTHORS[$author] ?? null;

            return $username !== null && isset($userIds[$username]) ? (int) $userIds[$username] : null;
        };

        [$ordered, $ids, $docIds] = $this->orderedRows();

        foreach ($ordered as $i => $r) {
            $id = $i + 1;
            [$status, $step] = $this->statusStep($r['round'], $r['plan']);

            $meta = ['Vòng xử lý: '.$r['round']];
            if ($r['due'] !== '') {
                $meta[] = 'Ngày dự kiến hoàn thành: '.$r['due'];
            }
            $meta[] = 'Trạng thái kế hoạch: '.$r['plan'];

            Document::updateOrCreate(['id' => $id], [
                'code' => $r['code'],
                'name' => $r['name'],
                'doc_type' => $this->docType($r['code']),
                'department_id' => self::DEPARTMENTS[$r['dept']],
                'owner_id' => $ownerIdOf($r['author']),
                'current_version' => match ($status) {
                    'published' => 'V1.0',
                    'approval_pending' => 'V0.3', // B4 "Chỉnh sửa 2"
                    default => 'V0.1',
                },
                'status' => $status,
                'status_updated_at' => $status === 'published' ? '2026-08-15 00:00:00' : null,
                'auto_version' => true,
                'workflow_step' => $step,
                'related_task_id' => null,
                'description' => implode(' | ', $meta),
                'effective_date' => null,
            ]);
        }

        // Dọn bản ghi cũ (versions/approvals/file đính kèm) của tài liệu fixture rồi seed lại.
        DocumentFile::whereIn('document_id', $docIds)->delete();
        DocumentVersion::whereIn('document_id', $docIds)->delete();
        DocumentApproval::whereIn('document_id', $docIds)->delete();

        foreach ($this->versionRows() as $v) {
            $version = DocumentVersion::create([
                'document_id' => $ids[$v['code']],
                'version' => $v['version'],
                'change_summary' => $v['summary'],
                'created_by' => $userIds[$v['creator']] ?? null,
                'approved_by' => isset($v['approver']) ? ($userIds[$v['approver']] ?? null) : null,
                'approved_at' => $v['approvedAt'] ?? null,
                'is_current' => $v['isCurrent'],
            ]);
            // created_at không thuộc fillable -> ghi thẳng để có lịch sử version đúng.
            $version->forceFill(['created_at' => $v['createdAt']])->save();
        }

        foreach ($this->approvalRows() as $a) {
            DocumentApproval::create([
                'document_id' => $ids[$a['code']],
                'version' => $a['version'],
                'step' => $a['step'],
                'action' => $a['action'],
                'comment' => $a['comment'],
                'approver_id' => $userIds[$a['approver']] ?? null,
                'decided_at' => $a['decidedAt'],
            ]);
        }
    }

    /** Sắp thứ tự seed: 8 mã lead trước (giữ id fixture), còn lại theo STT. */
    private function orderedRows(): array
    {
        $rows = $this->rows();

        $lead = [];
        foreach (self::LEAD_CODES as $code) {
            foreach ($rows as $r) {
                if ($r['code'] === $code) {
                    $lead[] = $r;
                    break;
                }
            }
        }
        $rest = array_values(array_filter($rows, static fn (array $r): bool => ! in_array($r['code'], self::LEAD_CODES, true)));
        $ordered = array_merge($lead, $rest);

        $ids = [];
        foreach ($ordered as $i => $r) {
            $ids[$r['code']] = $i + 1;
        }

        return [$ordered, $ids, array_values($ids)];
    }

    /** Trạng thái kế hoạch + vòng xử lý -> [documents.status, workflow_step]. */
    private function statusStep(string $round, string $plan): array
    {
        if ($plan === 'Done') {
            return ['published', 5];
        }
        if ($plan === 'Pending') {
            return ['reviewing', 3];
        }
        if ($plan === 'Not started') {
            // Chưa bắt đầu kế hoạch: dù đang ở vòng B3/Ph-Thẩm định cũng coi là draft.
            return ['draft', 1];
        }

        // In progress / Delayed - theo vòng xử lý hiện tại.
        return match (true) {
            str_starts_with($round, 'B4-') => ['approval_pending', 4],
            str_starts_with($round, 'B3-'), $round === 'Ph-Thẩm định' => ['reviewing', 3],
            default => ['draft', 1],
        };
    }

    /** docType theo tiền tố mã tài liệu. */
    private function docType(string $code): string
    {
        return match (true) {
            str_starts_with($code, 'ST-') => 'manual',
            str_starts_with($code, 'QT-') => 'procedure',
            str_starts_with($code, 'HD-') => 'work_instruction',
            str_starts_with($code, 'TC-') => 'standard',
            default => 'regulation', // QC- (Quy chế) và QĐ- (Quy định)
        };
    }

    private static function row(string $code, string $name, string $dept, string $author, string $round, string $due, string $plan): array
    {
        return compact('code', 'name', 'dept', 'author', 'round', 'due', 'plan');
    }

    /**
     * Dữ liệu 111 tài liệu theo thứ tự STT của bảng theo dõi.
     * row(mã, tên, phòng phụ trách, người biên soạn, vòng xử lý, ngày dự kiến, trạng thái).
     */
    private function rows(): array
    {
        return [
            // ---- BAN LÃNH ĐẠO ----
            self::row('QC-BALD.01', 'Quy chế SĐTC và trách nhiệm quyền hạn', 'P.HCNS', 'Phạm Hạnh', 'B1-Chưa dự thảo', 'TBD', 'Not started'),
            self::row('QT-BALĐ.01', 'Quy trình họp xem xét lãnh đạo', 'Ban ISO', 'Châu Loan', 'B1-Chưa dự thảo', '22/10/2026', 'In progress'),
            // ---- BAN ISO ----
            self::row('ST-BISO.01', 'Sổ tay chất lượng', 'Ban ISO', 'Châu Loan', 'B1-Chưa dự thảo', '15/11/2026', 'In progress'),
            self::row('QT-BISO.01', 'Quy trình sáng kiến cải tiến', 'Ban ISO', 'Châu Loan', 'B3-Thẩm định+Lấy góp ý', '-', 'Pending'),
            self::row('QT-BISO.02', 'Quy trình đánh giá nội bộ', 'Ban ISO', 'Châu Loan', 'B1-Chưa dự thảo', '10/11/2026', 'In progress'),
            self::row('QT-BISO.03', 'Quy trình phân tích bối cảnh và quản lý RR CH', 'Ban ISO', 'Châu Loan', 'B3-Thẩm định+Lấy góp ý', '-', 'Pending'),
            self::row('QT-BISO.04', 'QT xử lý sự KPH và hành động khắc phục', 'Ban ISO', 'Châu Loan', 'B1-Chưa dự thảo', '10/11/2026', 'In progress'),
            // ---- HCNS ----
            self::row('QC-HCNS.01', 'Quy chế SĐTC và TNQH Phòng HCNS', 'P.HCNS', 'Phạm Hạnh', 'B1-Chưa dự thảo', 'TBD', 'Not started'),
            self::row('QT-HCNS.01', 'Quy trình tuyển dụng', 'P.HCNS', 'Châu Loan', 'B4-Chỉnh sửa 2', '10/11/2026', 'Delayed'),
            self::row('QT-HCNS.02', 'Quy trình đào tạo', 'P.HCNS', 'Minh Hằng', 'B3-Thẩm định+Lấy góp ý', 'TBD', 'Not started'),
            self::row('QT-HCNS.03', 'Quy trình nghỉ việc', 'P.HCNS', 'Phạm Hạnh', 'B1-Chưa dự thảo', '9/30/2026', 'Delayed'),
            self::row('QT-HCNS.04', 'Quy trình bổ nhiệm, miễn nhiệm, luân chuyển', 'P.HCNS', 'Phạm Hạnh', 'B1-Chưa dự thảo', '10/3/2026', 'Delayed'),
            self::row('QT-HCNS.05', 'Quy trình quản lý văn bản, bưu kiện đi và đến', 'P.HCNS', 'Châu Loan', 'B5-Ban hành+Áp dụng', 'x', 'Done'),
            self::row('QT-HCNS.06', 'Quy trình kiểm soát thông tin dạng văn bản', 'P.HCNS', 'Châu Loan', 'B5-Ban hành+Áp dụng', 'x', 'Done'),
            self::row('QT-HCNS.07', 'Quy trình thử việc', 'P.HCNS', 'Minh Hằng', 'B1-Chưa dự thảo', '9/30/2026', 'Delayed'),
            self::row('QT-HCNS.08', 'Quy trình mua và cấp phát vật tư', 'P.HCNS', 'Mỹ Hương', 'B1-Chưa dự thảo', '15/10/2026', 'Delayed'),
            self::row('QT-HCNS.09', 'Quy trình kiểm soát ra/vào cổng', 'P.HCNS', 'Mỹ Hương', 'B1-Chưa dự thảo', '9/30/2026', 'Delayed'),
            self::row('QT-HCNS.10', 'Quy trình quản lý nhân sự', 'P.HCNS', 'Hồng Thơm', 'B1-Chưa dự thảo', '21/10/2026', 'In progress'),
            self::row('QT-HCNS.11', 'Quy trình đánh giá nhân sự', 'P.HCNS', 'M.Hằng+P.Hạnh', 'B1-Chưa dự thảo', 'TBD', 'Not started'),
            self::row('QĐ-HCNS.01', 'Quy định định dạng văn bản', 'P.HCNS', 'Châu Loan', 'B5-Ban hành+Áp dụng', 'x', 'Done'),
            self::row('QĐ-HCNS.02', 'Quy định chế độ công tác', 'P.HCNS', 'Châu Loan', 'B1-Chưa dự thảo', '26/10/2026', 'In progress'),
            self::row('QĐ-HCNS.03', 'Quy định chấm công', 'P.HCNS', 'Hồng Thơm', 'B1-Chưa dự thảo', '9/30/2026', 'Delayed'),
            self::row('QĐ-HCNS.04', 'Quy định tính lương', 'P.HCNS', 'Hồng Thơm', 'B1-Chưa dự thảo', '10/7/2026', 'Delayed'),
            self::row('QĐ-HCNS.05', 'Quy định về Văn hóa, quy tắc giao tiếp ứng xử', 'P.HCNS', 'Châu Loan', 'B1-Chưa dự thảo', '26/10/2026', 'In progress'),
            self::row('QĐ-HCNS.06', 'Quy định chế độ phúc lợi', 'P.HCNS', 'Phạm Hạnh', 'B1-Chưa dự thảo', '15/10/2026', 'Delayed'),
            self::row('QĐ-HCNS.07', 'Quy định trao đổi thông tin', 'P.HCNS', 'Minh Hằng', 'B1-Chưa dự thảo', '10/7/2026', 'Delayed'),
            self::row('HD-HCNS.01', 'Hướng dẫn công việc bảo vệ', 'P.HCNS', 'Mỹ Hương', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-HCNS.02', 'Hướng dẫn công việc tạp vụ', 'P.HCNS', 'Mỹ Hương', 'Ph-Thẩm định', '', 'Not started'),
            // ---- KD ----
            self::row('QC-PHKD.01', 'Quy chế SĐTC và TNQH Phòng KD', 'P.KD', 'Khải Hoàng', 'B1-Chưa dự thảo', '10/10/2026', 'Delayed'),
            self::row('QT-PHKD.01', 'Quy trình bán hàng', 'P.KD', 'Thái Bình', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-PHKD.02', 'Quy trình mua hàng', 'P.KD', 'Thái Bình', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-PHKD.03', 'Quy trình xử lý khiếu nại', 'P.KD', 'Thái Bình', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-PHKD.04', 'Quy trình đo lường sự thỏa mãn khách hàng', 'P.KD', 'Thái Bình', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-PHKD.05', 'Quy trình phát triển thị trường', 'P.KD', 'Minh Tuân', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-PHKD.06', 'Quy trình đánh giá và phê duyệt NCC', 'P.KD', 'Thái Bình', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-PHKD.07', 'Quy trình chăm sóc và phát triển khách hàng', 'P.KD', 'Minh Tuân', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-PHKD.08', 'Quy trình hỗ trợ dịch vụ kỹ thuật khách hàng', 'P.KD', 'Khải Hoàng', 'B1-Chưa dự thảo', '', 'Not started'),
            self::row('HD-PHKD.01', 'HD Thu thập, cập nhật dữ liệu thị trường/ KH / NMT / nhà thầu', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 1', 'In progress'),
            self::row('HD-PHKD.02', 'HD Phát triển khách hàng và cơ hội mới', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 2', 'In progress'),
            self::row('HD-PHKD.03', 'HD Tiếp nhận nhu cầu, làm rõ yêu cầu', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 2', 'In progress'),
            self::row('HD-PHKD.04', 'HD Đánh giá khả năng đáp ứng trước khi cam kết', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 1', 'In progress'),
            self::row('HD-PHKD.05', 'HD Quản lý cơ hội (pipeline)', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 2', 'In progress'),
            self::row('HD-PHKD.06', 'HD Lập và phát hành báo giá', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 1', 'In progress'),
            self::row('HD-PHKD.07', 'HD Thương lượng sau báo giá', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 1', 'In progress'),
            self::row('HD-PHKD.08', 'HD Lập và trình hợp đồng', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 1', 'In progress'),
            self::row('HD-PHKD.09', 'HD Xác nhận đơn hàng', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 1', 'In progress'),
            self::row('HD-PHKD.10', 'HD Bàn giao đơn và điều phối thực hiện', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 1', 'In progress'),
            self::row('HD-PHKD.11', 'HD Theo dõi tiến độ giao và hồ sơ giao', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 2', 'In progress'),
            self::row('HD-PHKD.12', 'HD Chăm sóc và phát triển KH hiện hữu', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 3', 'In progress'),
            self::row('HD-PHKD.13', 'HD Ghi nhận, xử lý sai lệch / khiếu nại', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 1', 'In progress'),
            self::row('HD-PHKD.14', 'HD QLBG: giám sát, phân tích, báo cáo luồng BG', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 1', 'In progress'),
            self::row('HD-PHKD.15', 'HD Cập nhật dữ liệu kinh doanh tối thiểu', 'P.KD', 'Khải Hoàng', 'Ph-Chưa dự thảo', 'Đợt 3', 'In progress'),
            // ---- TCKT ----
            self::row('QC-TCKT.01', 'Quy chế SĐTC và TNQH Phòng TCKT', 'P. TCKT', 'Thùy Trang', 'B1-Chưa dự thảo', '', 'Not started'),
            self::row('QC-TCKT.02', 'Quy chế tài chính', 'P. TCKT', 'Thùy Trang', 'B2-Check Gap+Sửa1', '10/12/2026', 'Delayed'),
            self::row('QC-TCKT.03', 'Quy chế chi tiêu nội bộ', 'P. TCKT', 'Thùy Trang', 'B2-Check Gap+Sửa1', '10/12/2026', 'Delayed'),
            self::row('QT-TCKT.01', 'Quy trình thu tiền', 'P. TCKT', 'Châu Loan', 'B2-Check Gap+Sửa1', '10/7/2026', 'Delayed'),
            self::row('QT-TCKT.02', 'Quy trình thanh toán', 'P. TCKT', 'Châu Loan', 'B2-Check Gap+Sửa1', '10/7/2026', 'Delayed'),
            self::row('QT-TCKT.03', 'Quy trình tạm ứng', 'P. TCKT', 'Châu Loan', 'B2-Check Gap+Sửa1', '10/7/2026', 'Delayed'),
            self::row('QT-TCKT.04', 'Quy trình thanh quyết toán tạm ứng', 'P. TCKT', 'Châu Loan', 'B2-Check Gap+Sửa1', '10/7/2026', 'Delayed'),
            self::row('QT-TCKT.05', 'Quy trình kiểm soát công nợ phải thu', 'P. TCKT', 'Thu Thủy', 'B2-Check Gap+Sửa1', '10/12/2026', 'Delayed'),
            self::row('QT-TCKT.06', 'Quy trình kiểm soát công nợ phải trả', 'P. TCKT', 'Thu Thủy', 'B2-Check Gap+Sửa1', '10/12/2026', 'Delayed'),
            self::row('QT-TCKT.07', 'Quy trình lập BCTC và BCQT', 'P. TCKT', 'Thu Thủy', 'B2-Check Gap+Sửa1', '10/12/2026', 'Delayed'),
            self::row('QĐ-TCKT.01', 'Quy định về bảo mật và sao lưu dữ liệu kế toán', 'P. TCKT', 'Thùy Trang', 'Ph-Chưa dự thảo', '10/12/2026', 'Delayed'),
            self::row('QĐ-TCKT.02', 'Quy định lập và ký đóng, lưu trữ chứng từ kế toán', 'P. TCKT', 'Thùy Trang', 'Ph-Chưa dự thảo', '10/12/2026', 'Delayed'),
            self::row('QĐ-TCKT.03', 'Quy định chứng từ cho các nghiệp vụ KT phát sinh', 'P. TCKT', 'Thùy Trang', 'Ph-Chưa dự thảo', '10/24/2026', 'In progress'),
            self::row('QĐ-TCKT.04', 'Quy định 5S và lưu trữ hồ sơ', 'P. TCKT', 'Thùy Trang', 'Ph-Chưa dự thảo', '10/24/2026', 'In progress'),
            self::row('QĐ-TCKT.05', 'Quy định thanh toán không dùng tiền mặt', 'P. TCKT', 'Thùy Trang', 'B2-Check Gap+Sửa1', '10/24/2026', 'In progress'),
            self::row('QĐ-TCKT.06', 'Quy định phương thức trao đổi thông tin P.TCKT', 'P. TCKT', 'Thùy Trang', 'Ph-Chưa dự thảo', '10/24/2026', 'In progress'),
            self::row('HD-TCKT.01', 'Hướng dẫn ma trận tài liệu công việc theo vị trí', 'P. TCKT', 'Thùy Trang', 'Ph-Chưa dự thảo', '10/24/2026', 'In progress'),
            // ---- KTSX ----
            self::row('QC-KTSX.01', 'Quy chế SĐTC và TNQH Phòng KTSX', 'P.KTSX', 'Tấn Vệ', 'B1-Chưa dự thảo', '', 'Not started'),
            self::row('QT-KTSX.01', 'Quy trình Kiểm soát SX và chất lượng sản phẩm', 'P.KTSX', 'Hoàng Huy', 'B3-Thẩm định+Lấy góp ý', '10/14/2026', 'Delayed'),
            self::row('QT-KTSX.02', 'Quy trình Thi công cán sản phẩm tại công trình', 'P.KTSX', 'Hoàng Huy', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-KTSX.03', 'Quy trình giao hàng', 'P.KTSX', 'Hoàng Huy', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-KTSX.04', 'Quy trình quản lý kho', 'P.KTSX', 'Hoàng Huy', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-KTSX.05', 'Quy trình quản lý thiết bị CSHT', 'P.KTSX', 'Hoàng Huy', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-KTSX.06', 'Quy trình điều độ lệnh sản xuất', 'P.KTSX', 'Hoàng Huy', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-KTSX.07', 'Quy trình triển khai bản vẽ và thiết kế', 'P.KTSX', 'Hoàng Huy', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('QT-KTSX.08', 'Quy trình dịch vụ service 24/07', 'P.KTSX', 'Hoàng Huy', 'B2-Check Gap+Sửa1', '10/10/2026', 'Delayed'),
            self::row('TC-KTSX.01', 'Tiêu chuẩn tôn cuộn', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('TC-KTSX.02', 'Tiêu chuẩn tôn cán sóng', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('TC-KTSX.03', 'Tiêu chuẩn sản phẩm tôn xốp PU', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('TC-KTSX.04', 'Tiêu chuẩn sản phẩm xà gồ', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('TC-KTSX.05', 'Tiêu chuẩn sản phẩm tôn seamlock', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('TC-KTSX.06', 'TIêu chuẩn sản phẩm tôn và phụ kiện panel', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('TC-KTSX.07', 'Tiêu chuẩn sản phẩm phụ kiện', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.01', 'HDCV PGĐ Kỹ thuật -Sản xuất', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.02', 'HDCV Trưởng phòng kỹ thuật (PE)', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.03', 'HDCV NVKT bản vẽ - quy trình', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.04', 'HDCV Nhân viên kỹ thuật bảo trì', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.05', 'HDCV Nhân viên kỹ thuật công trình', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.06', 'HDCV Trưởng phòng kế hoạch', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.07', 'HDCV Nhân viên kế hoạch - thống kê', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.08', 'HDCV NV điều phối - giao vận', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.09', 'HDCVc Thủ kho vật tư và thành phẩm', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.10', 'HDCV NV giao nhận (phụ kho-bốc xếp)', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.11', 'HDCV Nhân viên lái xe', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.12', 'HDCV Trưởng xưởng', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.13', 'HDCV Quản đốc nhà máy', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.14', 'HDCV Tổ trưởng/nhóm trưởng sản xuất', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.15', 'HDCV Công nhân sản xuất', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.16', 'HDVH máy cán tôn', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.17', 'HDVH Máy phun xốp PU', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.18', 'HDVH Máy cán xà gồ tự động CZ300', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.19', 'HDVH Máy nhấn vòm', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.20', 'HDVH Máy nhấn phụ kiện', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.21', 'HDVH Máy xả cuộn', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.22', 'HDVH Cẩu trục', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.23', 'HDVH Máy cắt laser fiber', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.24', 'HDVH Máy hàn đinh chống cắt RSN 2500A', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.25', 'HDVH Máy nhấn (máy chấn CNC) và SX phụ kiện', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
            self::row('HD-KTSX.26', 'HDVH Máy ép panel', 'P.KTSX', 'Hoàng Huy', 'Ph-Thẩm định', '', 'Not started'),
        ];
    }

    /**
     * Lịch sử version (chỉ cho tài liệu đã có version trong thực tế).
     * row(mã tài liệu, version, ghi chú, ngày tạo, hiện hành, người tạo, người phê duyệt?, ngày phê duyệt?).
     */
    private function versionRows(): array
    {
        $published = [
            ['QT-HCNS.05', 'chauloan'],
            ['QT-HCNS.06', 'chauloan'],
            ['QĐ-HCNS.01', 'chauloan'],
        ];

        $rows = [];
        foreach ($published as [$code, $creator]) {
            $rows[] = [
                'code' => $code, 'version' => 'V1.0', 'summary' => 'Ban hành theo kế hoạch ISO',
                'createdAt' => '2026-08-01 09:00:00', 'isCurrent' => true,
                'creator' => $creator, 'approver' => 'leader', 'approvedAt' => '2026-08-15 00:00:00',
            ];
        }

        $rows[] = ['code' => 'QT-HCNS.02', 'version' => 'V0.1', 'summary' => 'Dự thảo đầu tiên', 'createdAt' => '2026-10-06 09:00:00', 'isCurrent' => true, 'creator' => 'minhhang'];
        $rows[] = ['code' => 'QT-BISO.01', 'version' => 'V0.1', 'summary' => 'Dự thảo trình thẩm định', 'createdAt' => '2026-10-08 09:00:00', 'isCurrent' => true, 'creator' => 'chauloan'];
        $rows[] = ['code' => 'QT-HCNS.01', 'version' => 'V0.1', 'summary' => 'Dự thảo đầu tiên', 'createdAt' => '2026-09-01 09:00:00', 'isCurrent' => false, 'creator' => 'chauloan'];
        $rows[] = ['code' => 'QT-HCNS.01', 'version' => 'V0.2', 'summary' => 'Chỉnh sửa lần 1', 'createdAt' => '2026-09-20 09:00:00', 'isCurrent' => false, 'creator' => 'chauloan'];
        $rows[] = ['code' => 'QT-HCNS.01', 'version' => 'V0.3', 'summary' => 'Chỉnh sửa lần 2', 'createdAt' => '2026-10-06 09:00:00', 'isCurrent' => true, 'creator' => 'chauloan'];

        return $rows;
    }

    /**
     * Lịch sử transition workflow (step = trạng thái sau transition, khớp transition()).
     * row(mã tài liệu, version, step, action, comment, người quyết định, thời điểm).
     */
    private function approvalRows(): array
    {
        $rows = [];
        foreach (['QT-HCNS.05', 'QT-HCNS.06', 'QĐ-HCNS.01'] as $code) {
            $rows[] = ['code' => $code, 'version' => 'V1.0', 'step' => 'approved', 'action' => 'approve', 'comment' => 'Đồng ý ban hành', 'approver' => 'leader', 'decidedAt' => '2026-08-10 10:00:00'];
            $rows[] = ['code' => $code, 'version' => 'V1.0', 'step' => 'published', 'action' => 'publish', 'comment' => null, 'approver' => 'leader', 'decidedAt' => '2026-08-15 00:00:00'];
        }
        $rows[] = ['code' => 'QT-HCNS.01', 'version' => 'V0.3', 'step' => 'reviewing', 'action' => 'submit', 'comment' => 'Trình thẩm định', 'approver' => 'chauloan', 'decidedAt' => '2026-09-25 09:00:00'];
        $rows[] = ['code' => 'QT-HCNS.01', 'version' => 'V0.3', 'step' => 'approval_pending', 'action' => 'review', 'comment' => 'Đã thẩm định, yêu cầu chỉnh sửa', 'approver' => 'deputy', 'decidedAt' => '2026-09-28 09:00:00'];
        $rows[] = ['code' => 'QT-BISO.01', 'version' => 'V0.1', 'step' => 'reviewing', 'action' => 'submit', 'comment' => 'Trình thẩm định', 'approver' => 'chauloan', 'decidedAt' => '2026-10-08 09:00:00'];

        return $rows;
    }
}
