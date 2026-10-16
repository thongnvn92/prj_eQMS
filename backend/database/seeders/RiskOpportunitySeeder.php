<?php

namespace Database\Seeders;

use App\Models\Action;
use App\Models\Opportunity;
use App\Models\Risk;
use App\Models\RiskAssessment;
use Illuminate\Database\Seeder;

/**
 * Dữ liệu demo Rủi ro & Cơ hội – business rule theo QT-BISO.03-BM.02/03.
 * Idempotent (updateOrCreate theo code) – chạy lại không nhân bản.
 */
class RiskOpportunitySeeder extends Seeder
{
    public function run(): void
    {
        $this->seedRisks();
        $this->seedResidualExample();
        $this->seedOpportunities();
        $this->seedActionLinks();
    }

    private function seedRisks(): void
    {
        $risks = [
            ['code' => 'RISK-001', 'source_type' => 'internal', 'category' => 'human',
                'objective' => 'Đào tạo ISO cho nhân viên mới',
                'description' => 'Nhân viên mới chưa hoàn tất đào tạo hệ thống → sai sót khi vận hành quy trình.',
                'likelihood' => 5, 'impact' => 3, 'status' => 'in_progress',
                'treatment' => 'Lịch đào tạo hằng tháng, checklist onboarding ISO.',
                'expected_result' => '100% nhân viên mới hoàn tất đào tạo trong 30 ngày.',
                'owner_id' => 3, 'department_id' => 3,
                'review_frequency' => 'monthly', 'next_review_date' => '2026-09-30'],
            ['code' => 'RISK-002', 'source_type' => 'internal', 'category' => 'infrastructure',
                'objective' => 'Hạ tầng CNTT & sao lưu dữ liệu',
                'description' => 'Máy chủ chưa có backup tự động hằng ngày, rủi ro mất dữ liệu eQMS.',
                'likelihood' => 3, 'impact' => 2, 'status' => 'open',
                'treatment' => 'Thiết lập backup tự động + kiểm thử khôi phục hàng quý.',
                'owner_id' => 4, 'department_id' => 3,
                'review_frequency' => 'quarterly', 'next_review_date' => '2026-10-16'],
            ['code' => 'RISK-003', 'source_type' => 'external', 'category' => 'supplier',
                'objective' => 'Nguồn cung NVL đầu vào',
                'description' => 'Phụ thuộc duy nhất một nhà cung cấp NVL then chốt.',
                'likelihood' => 2, 'impact' => 2, 'status' => 'open',
                'treatment' => 'Đánh giá và mở thêm nhà cung cấp thứ hai, ký hợp đồng khung.',
                'expected_result' => 'Có ít nhất 2 nhà cung cấp được phê duyệt.',
                'owner_id' => 6, 'department_id' => 5,
                'review_frequency' => 'yearly', 'next_review_date' => '2026-11-30'],
            ['code' => 'RISK-004', 'source_type' => 'external', 'category' => 'political_legal',
                'objective' => 'Thay đổi luật định về môi trường',
                'description' => 'Dự thảo nghị định mới về phát thải có thể áp dụng từ 2027.',
                'likelihood' => 4, 'impact' => 4, 'status' => 'open',
                'treatment' => 'Theo dõi văn bản pháp luật, rà soát tác động hằng quý.',
                'owner_id' => 1, 'department_id' => 1,
                'review_frequency' => 'quarterly', 'next_review_date' => '2027-01-15'],
            ['code' => 'RISK-005', 'source_type' => 'internal', 'category' => 'process',
                'objective' => 'Quy trình xử lý khiếu nại',
                'description' => 'Thời hạn phản hồi khiếu nại chưa được quy định rõ.',
                'likelihood' => 2, 'impact' => 3, 'status' => 'closed',
                'treatment' => 'Bổ sung bước thời hạn phản hồi 24h vào quy trình.',
                'expected_result' => 'Quy trình ban hành, phản hồi khiếu nại ≤24h.',
                'owner_id' => 8, 'department_id' => 4,
                'review_frequency' => null, 'next_review_date' => null],
            ['code' => 'RISK-006', 'source_type' => 'interested_party', 'category' => 'customer',
                'objective' => 'Yêu cầu khách hàng lớn về chứng nhận',
                'description' => 'Khách hàng xuất khẩu yêu cầu bổ sung chứng nhận phụ trợ.',
                'likelihood' => 2, 'impact' => 4, 'status' => 'open',
                'treatment' => 'Liên hệ tổ chức chứng nhận, lập kế hoạch đánh giá.',
                'owner_id' => 2, 'department_id' => 2,
                'review_frequency' => 'monthly', 'next_review_date' => '2026-10-25'],
        ];

        foreach ($risks as $r) {
            $score = $r['likelihood'] * $r['impact'];
            $level = match (true) {
                $score <= 4 => 'low',
                $score <= 10 => 'medium',
                default => 'high',
            };
            $risk = Risk::updateOrCreate(
                ['code' => $r['code']],
                array_merge($r, [
                    'risk_score' => $score,
                    'risk_level' => $level,
                    'initial_likelihood' => $r['likelihood'],
                    'initial_impact' => $r['impact'],
                    'initial_score' => $score,
                    'initial_level' => $level,
                    'start_date' => '2026-10-01',
                    'due_date' => '2026-12-31',
                    'created_by' => 1,
                    'updated_by' => 1,
                ])
            );

            RiskAssessment::firstOrCreate(
                ['risk_id' => $risk->id, 'kind' => 'initial'],
                [
                    'likelihood' => $risk->likelihood,
                    'impact' => $risk->impact,
                    'score' => $risk->risk_score,
                    'level' => $risk->risk_level,
                    'assessed_by' => 1,
                ]
            );
        }
    }

    /** Ví dụ Đánh giá lại (residual): RISK-006 từ 2×4=8 medium → 1×2=2 low, initial giữ nguyên. */
    private function seedResidualExample(): void
    {
        $r6 = Risk::where('code', 'RISK-006')->first();
        if ($r6 && ! RiskAssessment::where('risk_id', $r6->id)->where('kind', 'residual')->exists()) {
            $r6->update([
                'likelihood' => 1, 'impact' => 2, 'risk_score' => 2, 'risk_level' => 'low',
                'last_reviewed_by' => 2, 'last_reviewed_at' => now(),
                'last_review_comment' => 'Đã liên hệ tổ chức chứng nhận, rủi ro giảm.',
            ]);
            RiskAssessment::create([
                'risk_id' => $r6->id, 'kind' => 'residual',
                'likelihood' => 1, 'impact' => 2, 'score' => 2, 'level' => 'low',
                'assessed_by' => 2, 'comment' => 'Đã liên hệ tổ chức chứng nhận, rủi ro giảm.',
            ]);
        }
    }

    private function seedOpportunities(): void
    {
        $opps = [
            ['code' => 'OPP-001', 'source_type' => 'internal', 'category' => 'process',
                'objective' => 'Triển khai hệ thống ISO 9001 toàn công ty',
                'description' => 'Áp dụng eQMS chuẩn ISO 9001:2015 làm nền tảng quản lý.',
                'feasibility' => 4, 'benefit' => 3, 'status' => 'in_progress',
                'solution' => 'Đào tạo, xây dựng tài liệu, triển khai, đánh giá nội bộ.',
                'expected_result' => 'Đạt chứng nhận ISO 9001:2015.',
                'owner_id' => 1, 'department_id' => 1,
                'review_frequency' => 'monthly', 'next_review_date' => '2026-10-20'],
            ['code' => 'OPP-002', 'source_type' => 'external', 'category' => 'customer',
                'objective' => 'Mở rộng khách hàng xuất khẩu',
                'description' => 'Nhu cầu thị trường EU tăng, cần đánh giá khả năng đáp ứng.',
                'feasibility' => 3, 'benefit' => 3, 'status' => 'open',
                'solution' => 'Nghiên cứu thị trường, lập hồ sơ năng lực xuất khẩu.',
                'owner_id' => 5, 'department_id' => 4,
                'review_frequency' => 'quarterly', 'next_review_date' => '2026-12-31'],
            ['code' => 'OPP-003', 'source_type' => 'internal', 'category' => 'capital',
                'objective' => 'Tối ưu chi phí vận hành kho',
                'description' => 'Ứng dụng lưu trữ điện tử giảm chi phí giấy tờ.',
                'feasibility' => 2, 'benefit' => 2, 'status' => 'open',
                'solution' => 'Lưu hồ sơ tham khảo khi điều kiện cho phép.',
                'owner_id' => 4, 'department_id' => 3,
                'review_frequency' => null, 'next_review_date' => null],
            ['code' => 'OPP-004', 'source_type' => 'interested_party', 'category' => 'management',
                'objective' => 'Báo cáo Ban Lãnh đạo tự động từ KPI',
                'description' => 'Dashboard eQMS cung cấp dữ liệu management review theo thời gian thực.',
                'feasibility' => 5, 'benefit' => 4, 'status' => 'open',
                'solution' => 'Kết nối KPI module với dashboard, phê duyệt bởi BGĐ.',
                'expected_result' => 'BGĐ nhận báo cáo tự động hằng tháng.',
                'owner_id' => 2, 'department_id' => 2,
                'review_frequency' => 'monthly', 'next_review_date' => '2026-10-30'],
            ['code' => 'OPP-005', 'source_type' => 'external', 'category' => 'community',
                'objective' => 'Chương trình cộng đồng về môi trường',
                'description' => 'Hợp tác chương trình xanh nâng cao danh tiếng doanh nghiệp.',
                'feasibility' => 3, 'benefit' => 2, 'status' => 'open',
                'solution' => 'Đề xuất phương án và thời điểm triển khai phù hợp.',
                'owner_id' => 6, 'department_id' => 5,
                'review_frequency' => 'yearly', 'next_review_date' => '2027-02-28'],
        ];

        foreach ($opps as $o) {
            $score = $o['feasibility'] * $o['benefit'];
            $level = match (true) {
                $score <= 4 => 'ignore',
                $score <= 10 => 'research',
                default => 'priority',
            };
            Opportunity::updateOrCreate(
                ['code' => $o['code']],
                array_merge($o, [
                    'opportunity_score' => $score,
                    'opportunity_level' => $level,
                    'created_by' => 1,
                    'updated_by' => 1,
                ])
            );
        }
    }

    /** Liên kết Actions hiện có / mới với Risk & Opportunity (reuse module Actions). */
    private function seedActionLinks(): void
    {
        $risk3 = Risk::where('code', 'RISK-003')->first();
        $risk1 = Risk::where('code', 'RISK-001')->first();
        $opp1 = Opportunity::where('code', 'OPP-001')->first();

        if ($risk3) {
            Action::where('code', 'ACT-006')->update(['related_risk_id' => $risk3->id, 'source' => 'risk']);
        }
        if ($risk1) {
            Action::updateOrCreate(
                ['code' => 'ACT-R01'],
                ['title' => 'Lịch đào tạo ISO hằng tháng cho nhân viên mới', 'source' => 'risk',
                    'department_id' => 3, 'owner_id' => 3, 'related_risk_id' => $risk1->id,
                    'due_date' => '2026-11-30', 'status' => 'in_progress', 'progress' => 40, 'created_by' => 1]
            );
        }
        if ($opp1) {
            Action::updateOrCreate(
                ['code' => 'ACT-O01'],
                ['title' => 'Đào tạo ISO 9001:2015 cho toàn thể nhân viên', 'source' => 'opportunity',
                    'department_id' => 1, 'owner_id' => 1, 'related_opportunity_id' => $opp1->id,
                    'due_date' => '2026-11-15', 'status' => 'open', 'progress' => 0, 'created_by' => 1]
            );
        }
    }
}
