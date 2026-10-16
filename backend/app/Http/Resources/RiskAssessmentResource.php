<?php

namespace App\Http\Resources;

use App\Models\RiskAssessment;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Lịch sử đánh giá rủi ro (initial / residual).
 *
 * @mixin RiskAssessment
 */
class RiskAssessmentResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'riskId' => $this->risk_id,
            'kind' => $this->kind,
            'likelihood' => (int) $this->likelihood,
            'impact' => (int) $this->impact,
            'score' => (int) $this->score,
            'level' => $this->level,
            'assessedBy' => $this->assessed_by,
            'comment' => $this->comment,
            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
