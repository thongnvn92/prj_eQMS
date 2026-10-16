<?php

namespace App\Enums;

/**
 * Mức rủi ro – QT-BISO.03-BM.02:
 * 1–4 = low, 5–10 = medium, >=12 = high (score = likelihood × impact).
 */
enum RiskLevel: string
{
    case Low = 'low';
    case Medium = 'medium';
    case High = 'high';

    public function label(): string
    {
        return match ($this) {
            self::Low => 'Rủi ro thấp',
            self::Medium => 'Rủi ro trung bình',
            self::High => 'Rủi ro lớn',
        };
    }

    /** Phân loại theo điểm số (backend authoritative). */
    public static function fromScore(int $score): self
    {
        return match (true) {
            $score <= 4 => self::Low,
            $score <= 10 => self::Medium,
            default => self::High,
        };
    }
}
