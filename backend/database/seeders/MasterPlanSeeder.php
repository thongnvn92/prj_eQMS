<?php

namespace Database\Seeders;

use App\Models\MasterPlan;
use App\Models\MasterPlanPhase;
use App\Models\MasterPlanTask;
use Illuminate\Database\Seeder;

class MasterPlanSeeder extends Seeder
{
    private const NAMES = [
        1 => 'Xây dựng Kế hoạch ISO năm 2027',
        2 => 'Rà soát mục tiêu và phạm vi ISO',
        3 => 'Rà soát danh mục tài liệu hiện hành',
        4 => 'Phân công đầu mối ISO tại các Phòng',
        5 => 'Xác định nhu cầu đào tạo ISO',
        6 => 'Biên soạn QT-KD.01 Quy trình bán hàng',
        7 => 'Cập nhật Sổ tay chất lượng (QMS Manual)',
        8 => 'Thẩm định và lấy ý kiến các Phòng',
        9 => 'Trình phê duyệt và ban hành tài liệu',
        10 => 'Tổ chức đào tạo/chia sẻ ISO toàn công ty',
        11 => 'Triển khai áp dụng tại các Phòng',
        12 => 'Kiểm tra tuân thủ nội bộ',
        13 => 'Đánh giá nội bộ (Internal Audit)',
        14 => 'Lập Action List khắc phục từ kết quả audit',
        15 => 'Đánh giá KPI hệ thống & báo cáo Ban Lãnh đạo',
        16 => 'Tổ chức buổi chia sẻ ISO với nhân viên mới',
    ];

    private const RESULTS = [
        1 => 'Kế hoạch được Ban Giám đốc phê duyệt 12/10/2026',
        4 => 'Đã ban hành quyết định phân công đầu mối',
    ];

    private const NOTES = [
        6 => 'Chờ góp ý Phòng Kinh doanh',
        16 => 'Chờ Phòng HC-NS xác nhận danh sách',
    ];

    public function run(): void
    {
        $masterPlan = MasterPlan::updateOrCreate(
            ['cycle_label' => 'T10/2026–T12/2027'],
            [
                'code' => 'MP-2026',
                'name' => 'Kế hoạch ISO T10/2026 – T12/2027',
                'status' => 'in_progress',
                'start_date' => '2026-09-01',
                'end_date' => '2027-12-31',
                'description' => 'Quy trình chuẩn bị, biên soạn, phê duyệt, ban hành, đào tạo và báo cáo ISO.',
                'created_by' => 1,
            ],
        );

        foreach ($this->phaseRows() as $p) {
            MasterPlanPhase::updateOrCreate(
                ['id' => $p['id']],
                array_merge(['master_plan_id' => $masterPlan->id], $p)
            );
        }

        foreach ($this->taskRows() as $r) {
            $id = $r['id'];
            $r['name'] = self::NAMES[$id];
            if (isset(self::RESULTS[$id])) {
                $r['result'] = self::RESULTS[$id];
            }
            if (isset(self::NOTES[$id])) {
                $r['note'] = self::NOTES[$id];
            }
            unset($r['id']);
            MasterPlanTask::updateOrCreate(['id' => $id], $r);
        }
    }

    private function phaseRows(): array
    {
        return [
            ['id' => 1, 'code' => 'P1', 'name' => 'Giai đoạn 1 – Chuẩn bị & Rà soát (T10–T11/2026)', 'start_date' => '2026-10-01', 'end_date' => '2026-11-30', 'sort_order' => 1],
            ['id' => 2, 'code' => 'P2', 'name' => 'Giai đoạn 2 – Biên soạn & Phê duyệt (T12/2026 – T04/2027)', 'start_date' => '2026-12-01', 'end_date' => '2027-04-30', 'sort_order' => 2],
            ['id' => 3, 'code' => 'P3', 'name' => 'Giai đoạn 3 – Ban hành & Đào tạo (T05 – T08/2027)', 'start_date' => '2027-05-01', 'end_date' => '2027-08-31', 'sort_order' => 3],
            ['id' => 4, 'code' => 'P4', 'name' => 'Giai đoạn 4 – Đánh giá & Báo cáo (T09 – T12/2027)', 'start_date' => '2027-09-01', 'end_date' => '2027-12-31', 'sort_order' => 4],
        ];
    }

    /** Fixtures 16 tasks – khớp mock/seed.ts của frontend */
    private function taskRows(): array
    {
        return [
            ['id' => 1, 'code' => 'MP-001', 'phase_id' => 1, 'owner_id' => 3, 'department_id' => 2, 'priority' => 'high', 'status' => 'completed', 'progress' => 100, 'start_date' => '2026-10-01', 'due_date' => '2026-10-15'],
            ['id' => 2, 'code' => 'MP-002', 'phase_id' => 1, 'owner_id' => 2, 'department_id' => 2, 'priority' => 'high', 'status' => 'in_progress', 'progress' => 60, 'start_date' => '2026-10-05', 'due_date' => '2026-10-20'],
            ['id' => 3, 'code' => 'MP-003', 'phase_id' => 1, 'owner_id' => 5, 'department_id' => 3, 'priority' => 'medium', 'status' => 'in_progress', 'progress' => 40, 'start_date' => '2026-10-05', 'due_date' => '2026-10-31'],
            ['id' => 4, 'code' => 'MP-004', 'phase_id' => 1, 'owner_id' => 3, 'department_id' => 2, 'priority' => 'medium', 'status' => 'completed', 'progress' => 100, 'start_date' => '2026-10-01', 'due_date' => '2026-10-05'],
            ['id' => 5, 'code' => 'MP-005', 'phase_id' => 1, 'owner_id' => 4, 'department_id' => 2, 'priority' => 'low', 'status' => 'not_started', 'progress' => 0, 'start_date' => '2026-10-01', 'due_date' => '2026-09-28'],
            ['id' => 6, 'code' => 'MP-006', 'phase_id' => 2, 'owner_id' => 5, 'department_id' => 4, 'priority' => 'high', 'status' => 'delayed', 'progress' => 30, 'start_date' => '2026-10-01', 'due_date' => '2026-09-30'],
            ['id' => 7, 'code' => 'MP-007', 'phase_id' => 2, 'owner_id' => 3, 'department_id' => 2, 'priority' => 'critical', 'status' => 'in_progress', 'progress' => 55, 'start_date' => '2026-10-08', 'due_date' => '2026-10-25'],
            ['id' => 8, 'code' => 'MP-008', 'phase_id' => 2, 'owner_id' => 2, 'department_id' => 2, 'priority' => 'medium', 'status' => 'not_started', 'progress' => 0, 'start_date' => '2026-11-01', 'due_date' => '2026-11-15'],
            ['id' => 9, 'code' => 'MP-009', 'phase_id' => 2, 'owner_id' => 2, 'department_id' => 2, 'priority' => 'high', 'status' => 'not_started', 'progress' => 0, 'start_date' => '2026-11-16', 'due_date' => '2026-12-01'],
            ['id' => 10, 'code' => 'MP-010', 'phase_id' => 3, 'owner_id' => 4, 'department_id' => 2, 'priority' => 'medium', 'status' => 'not_started', 'progress' => 0, 'start_date' => '2027-05-05', 'due_date' => '2027-05-20'],
            ['id' => 11, 'code' => 'MP-011', 'phase_id' => 3, 'owner_id' => 3, 'department_id' => 2, 'priority' => 'medium', 'status' => 'not_started', 'progress' => 0, 'start_date' => '2027-05-21', 'due_date' => '2027-06-30'],
            ['id' => 12, 'code' => 'MP-012', 'phase_id' => 4, 'owner_id' => 7, 'department_id' => 2, 'priority' => 'high', 'status' => 'not_started', 'progress' => 0, 'start_date' => '2027-09-01', 'due_date' => '2027-09-15'],
            ['id' => 13, 'code' => 'MP-013', 'phase_id' => 4, 'owner_id' => 7, 'department_id' => 2, 'priority' => 'critical', 'status' => 'not_started', 'progress' => 0, 'start_date' => '2027-09-16', 'due_date' => '2027-10-15'],
            ['id' => 14, 'code' => 'MP-014', 'phase_id' => 4, 'owner_id' => 7, 'department_id' => 2, 'priority' => 'high', 'status' => 'not_started', 'progress' => 0, 'start_date' => '2027-10-16', 'due_date' => '2027-11-01'],
            ['id' => 15, 'code' => 'MP-015', 'phase_id' => 4, 'owner_id' => 2, 'department_id' => 2, 'priority' => 'high', 'status' => 'not_started', 'progress' => 0, 'start_date' => '2027-11-02', 'due_date' => '2027-12-10'],
            ['id' => 16, 'code' => 'MP-016', 'phase_id' => 1, 'owner_id' => 4, 'department_id' => 2, 'priority' => 'low', 'status' => 'blocked', 'progress' => 10, 'start_date' => '2026-10-06', 'due_date' => '2026-11-10'],
        ];
    }
}
