<?php

namespace App\Enums;

enum TaskStatus: string
{
    case NotStarted = 'not_started';
    case InProgress = 'in_progress';
    case Blocked = 'blocked';
    case Delayed = 'delayed';
    case Completed = 'completed';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return match ($this->value) {
            self::NotStarted->value => 'Chưa thực hiện',
            self::InProgress->value => 'Đang thực hiện',
            self::Blocked->value => 'Bị chặn',
            self::Delayed->value => 'Trễ hạn',
            self::Completed->value => 'Hoàn thành',
            self::Cancelled->value => 'Đã hủy',
        };
    }
}
