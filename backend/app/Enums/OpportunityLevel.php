<?php

namespace App\Enums;

/**
 * Phân loại cơ hội – QT-BISO.03-BM.03:
 * 1–4 = tạm bỏ qua, 5–10 = nghiên cứu thêm, >=12 = ưu tiên hành động.
 */
enum OpportunityLevel: string
{
    case Ignore = 'ignore';
    case Research = 'research';
    case Priority = 'priority';

    public function label(): string
    {
        return match ($this) {
            self::Ignore => 'Cơ hội tạm thời bỏ qua',
            self::Research => 'Cơ hội nghiên cứu thêm',
            self::Priority => 'Cơ hội ưu tiên hành động',
        };
    }

    /** Phân loại theo điểm số (backend authoritative). */
    public static function fromScore(int $score): self
    {
        return match (true) {
            $score <= 4 => self::Ignore,
            $score <= 10 => self::Research,
            default => self::Priority,
        };
    }
}
