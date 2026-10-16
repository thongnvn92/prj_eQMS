<?php

namespace App\Enums;

enum ActionStatus: string
{
    case Open = 'open';
    case InProgress = 'in_progress';
    case Blocked = 'blocked';
    case Overdue = 'overdue';
    case PendingVerification = 'pending_verification';
    case Verified = 'verified';
    case Closed = 'closed';

    public function label(): string
    {
        return match ($this->value) {
            self::Open->value => 'Mở',
            self::InProgress->value => 'Đang xử lý',
            self::Blocked->value => 'Bị chặn',
            self::Overdue->value => 'Quá hạn',
            self::PendingVerification->value => 'Chờ xác minh',
            self::Verified->value => 'Đã xác minh',
            self::Closed->value => 'Đã đóng',
        };
    }
}
