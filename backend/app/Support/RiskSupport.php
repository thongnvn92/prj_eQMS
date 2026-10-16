<?php

namespace App\Support;

use App\Enums\OpportunityLevel;
use App\Enums\RiskLevel;

/**
 * Hỗ trợ Risk & Opportunity – danh mục theo biểu mẫu nguồn
 * QT-BISO.03-BM.02 (Rủi ro) & QT-BISO.03-BM.03 (Cơ hội).
 * KHÔNG tự phát minh business rule ngoài tài liệu.
 */
class RiskSupport
{
    /** Nguồn rủi ro/cơ hội – "Bên trong / Bên ngoài / Các bên quan tâm". */
    public const SOURCE_TYPES = ['internal', 'external', 'interested_party'];

    /** Nhóm nguồn rủi ro theo biểu mẫu (key => label). */
    public const CATEGORIES = [
        'weakness' => 'Điểm yếu',
        'human' => 'Con người',
        'infrastructure' => 'Cơ sở hạ tầng',
        'capital' => 'Nguồn vốn',
        'materials' => 'NVL',
        'process' => 'QT / PP / HTQL',
        'location_environment' => 'Vị trí địa lý / Môi trường',
        'political_legal' => 'Chính trị / luật định',
        'competitor' => 'Đối thủ',
        'customer' => 'Khách hàng',
        'supplier' => 'Nhà cung cấp',
        'management' => 'Ban lãnh đạo',
        'employee' => 'Nhân viên',
        'community' => 'Cộng đồng',
    ];

    /** Chu kỳ đánh giá – "Hằng ngày / tháng / quý / năm / Theo lô / Custom". */
    public const REVIEW_FREQUENCIES = ['daily', 'monthly', 'quarterly', 'yearly', 'batch', 'custom'];

    /** Trạng thái workflow: open|in_progress|blocked|pending_verification|closed (CR-RISK-OPPORTUNITY-001). */
    public const STATUSES = ['open', 'in_progress', 'blocked', 'pending_verification', 'closed'];

    /**
     * Mã tự sinh khi client không gửi code (RISK-001, OPP-001, ...).
     * Quét suffix hiện có, tăng dần đến khi không trùng – thuần PHP, không phụ thuộc engine DB.
     */
    public static function nextCode(string $modelClass, string $prefix): string
    {
        $max = $modelClass::where('code', 'like', $prefix.'-%')
            ->pluck('code')
            ->map(static fn ($code): int => (int) preg_replace('/\D+/', '', substr((string) $code, strlen($prefix) + 1)))
            ->max() ?? 0;

        do {
            $code = $prefix.'-'.str_pad((string) ++$max, 3, '0', STR_PAD_LEFT);
        } while ($modelClass::where('code', $code)->exists());

        return $code;
    }

    /** Điểm rủi ro = Khả năng xảy ra × Mức ảnh hưởng (user KHÔNG nhập trực tiếp). */
    public static function riskScore(int $likelihood, int $impact): int
    {
        return $likelihood * $impact;
    }

    public static function riskLevel(int $score): RiskLevel
    {
        return RiskLevel::fromScore($score);
    }

    /** Điểm cơ hội = Khả năng khả thi × Lợi ích. */
    public static function opportunityScore(int $feasibility, int $benefit): int
    {
        return $feasibility * $benefit;
    }

    public static function opportunityLevel(int $score): OpportunityLevel
    {
        return OpportunityLevel::fromScore($score);
    }

    /**
     * Trạng thái review tính từ nextReviewDate:
     * overdue (quá hạn) | due_soon (≤7 ngày) | normal | null (không đặt lịch).
     */
    public static function reviewStatus(?string $nextReviewDate, string $status): ?string
    {
        if ($nextReviewDate === null || $status === 'closed') {
            return null;
        }
        $today = now()->format('Y-m-d');
        if ($nextReviewDate < $today) {
            return 'overdue';
        }
        if ($nextReviewDate <= now()->addDays(7)->format('Y-m-d')) {
            return 'due_soon';
        }

        return 'normal';
    }
}
