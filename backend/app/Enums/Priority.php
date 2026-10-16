<?php

namespace App\Enums;

enum Priority: string
{
    case Critical = 'critical';
    case High = 'high';
    case Medium = 'medium';
    case Low = 'low';

    public function label(): string
    {
        return match ($this->value) {
            self::Critical->value => 'Critical',
            self::High->value => 'High',
            self::Medium->value => 'Medium',
            self::Low->value => 'Low',
        };
    }
}
