<?php

namespace App\Enums;

enum DocumentStatus: string
{
    /** Chưa dự thảo (dự kiến) – đầu workflow mới. */
    case Planned = 'planned';
    case Draft = 'draft';
    /** Chờ thẩm định – đã trình, reviewer chưa bắt đầu. */
    case ReviewPending = 'review_pending';
    case Reviewing = 'reviewing';
    case ApprovalPending = 'approval_pending';
    case Approved = 'approved';
    case Published = 'published';
    case Obsolete = 'obsolete';
    case Archived = 'archived';

    public function label(): string
    {
        return match ($this->value) {
            self::Planned->value => 'Chưa dự thảo',
            self::Draft->value => 'Bản nháp (soạn thảo)',
            self::ReviewPending->value => 'Chờ thẩm định',
            self::Reviewing->value => 'Đang thẩm định',
            self::ApprovalPending->value => 'Chờ phê duyệt',
            self::Approved->value => 'Đã phê duyệt',
            self::Published->value => 'Đã ban hành',
            self::Obsolete->value => 'Lỗi thời',
            self::Archived->value => 'Lưu trữ',
        };
    }

    /**
     * Mã trạng thái workflow (bắt buộc – không admin xóa được) theo thứ tự pipeline.
     * Dùng làm dữ liệu seed cho bảng `document_statuses` (dictionary do admin quản lý).
     *
     * @return array<int, array{code: string, label: string, color: string, sort_order: int}>
     */
    public static function pipeline(): array
    {
        $rows = [
            ['code' => self::Planned->value, 'label' => self::Planned->label(), 'color' => '#8c8c8c', 'sort_order' => 10],
            ['code' => self::Draft->value, 'label' => self::Draft->label(), 'color' => '#595959', 'sort_order' => 20],
            ['code' => self::ReviewPending->value, 'label' => self::ReviewPending->label(), 'color' => '#d4b106', 'sort_order' => 30],
            ['code' => self::Reviewing->value, 'label' => self::Reviewing->label(), 'color' => '#1677ff', 'sort_order' => 40],
            ['code' => self::ApprovalPending->value, 'label' => self::ApprovalPending->label(), 'color' => '#faad14', 'sort_order' => 50],
            ['code' => self::Approved->value, 'label' => self::Approved->label(), 'color' => '#2f54eb', 'sort_order' => 60],
            ['code' => self::Published->value, 'label' => self::Published->label(), 'color' => '#52c41a', 'sort_order' => 70],
            ['code' => self::Obsolete->value, 'label' => self::Obsolete->label(), 'color' => '#fa8c16', 'sort_order' => 80],
            ['code' => self::Archived->value, 'label' => self::Archived->label(), 'color' => '#bfbfbf', 'sort_order' => 90],
        ];

        return $rows;
    }
}
