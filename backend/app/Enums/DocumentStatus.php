<?php

namespace App\Enums;

enum DocumentStatus: string
{
    case Draft = 'draft';
    case Reviewing = 'reviewing';
    case ApprovalPending = 'approval_pending';
    case Approved = 'approved';
    case Published = 'published';
    case Obsolete = 'obsolete';
    case Archived = 'archived';

    public function label(): string
    {
        return match ($this->value) {
            self::Draft->value => 'Bản nháp',
            self::Reviewing->value => 'Đang thẩm định',
            self::ApprovalPending->value => 'Chờ phê duyệt',
            self::Approved->value => 'Đã phê duyệt',
            self::Published->value => 'Đã ban hành',
            self::Obsolete->value => 'Lỗi thời',
            self::Archived->value => 'Lưu trữ',
        };
    }
}
