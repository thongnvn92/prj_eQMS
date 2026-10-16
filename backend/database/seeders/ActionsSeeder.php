<?php

namespace Database\Seeders;

use App\Models\Action;
use Illuminate\Database\Seeder;

/** Fixtures 6 actions – khớp mock/seed.ts */
class ActionsSeeder extends Seeder
{
    public function run(): void
    {
        $rows = [
            ['id' => 1, 'code' => 'ACT-001', 'title' => 'Cập nhật Quy trình xử lý khiếu nại theo kết quả audit 2025', 'description' => 'Bổ sung bước thời hạn phản hồi khách hàng 24h.', 'source' => 'audit_finding', 'department_id' => 4, 'owner_id' => 8, 'issue_description' => 'Quy trình chưa quy định thời hạn xử lý khiếu nại', 'related_document_id' => 4, 'due_date' => '2026-10-15', 'status' => 'in_progress', 'progress' => 50, 'evidence' => null, 'created_by' => 2],
            ['id' => 2, 'code' => 'ACT-002', 'title' => 'Hoàn thiện biên bản đánh giá nội bộ 2026', 'description' => 'Tổng hợp checklist và phát hiện của đoàn đánh giá.', 'source' => 'internal_audit', 'department_id' => 2, 'owner_id' => 7, 'issue_description' => 'Chưa ban hành biên bản audit nội bộ', 'related_task_id' => 13, 'due_date' => '2026-10-31', 'status' => 'open', 'progress' => 0, 'evidence' => null, 'created_by' => 1],
            ['id' => 3, 'code' => 'ACT-003', 'title' => 'Đào tạo ISO cho nhân viên mới quý III', 'description' => 'Đã đào tạo 42/60 nhân viên, còn 18 người lịch tháng sau.', 'source' => 'management', 'department_id' => 3, 'owner_id' => 4, 'issue_description' => 'Nhân viên mới chưa được đào tạo hệ thống', 'due_date' => '2026-09-30', 'status' => 'overdue', 'progress' => 70, 'evidence' => null, 'created_by' => 3],
            ['id' => 4, 'code' => 'ACT-004', 'title' => 'Kiểm kê và loại bỏ tài liệu lỗi thời', 'description' => 'Đã lập danh sách 12 tài liệu obsolete chờ duyệt đóng.', 'source' => 'ncr', 'department_id' => 2, 'owner_id' => 3, 'issue_description' => 'Tài liệu cũ còn lưu tại các phòng', 'related_document_id' => 5, 'due_date' => '2026-09-20', 'status' => 'verified', 'progress' => 100, 'result' => 'Đã rà soát xong 12/12 tài liệu', 'evidence' => null, 'created_by' => 1],
            ['id' => 5, 'code' => 'ACT-005', 'title' => 'Cải thiện quy trình báo giá cho khách hàng lớn', 'source' => 'complaint', 'department_id' => 4, 'owner_id' => 5, 'issue_description' => 'Khách hàng phản hồi thời gian báo giá chậm', 'related_document_id' => 6, 'due_date' => '2026-11-15', 'status' => 'open', 'progress' => 0, 'evidence' => null, 'created_by' => 2],
            ['id' => 6, 'code' => 'ACT-006', 'title' => 'Bổ sung hồ sơ đánh giá năng lực nhà cung cấp', 'source' => 'risk', 'department_id' => 5, 'owner_id' => 6, 'issue_description' => 'Nhà cung cấp vật tư chưa có hồ sơ năng lực', 'due_date' => '2026-10-20', 'status' => 'in_progress', 'progress' => 35, 'evidence' => null, 'created_by' => 5],
        ];

        foreach ($rows as $r) {
            $id = $r['id'];
            unset($r['id']);
            Action::updateOrCreate(['id' => $id], $r);
        }
    }
}
