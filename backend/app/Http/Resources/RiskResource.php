<?php

namespace App\Http\Resources;

use App\Models\Risk;
use App\Support\RiskSupport;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Risk -> contract `RiskItem` của FE (camelCase, không leak snake_case).
 *
 * @mixin Risk
 */
class RiskResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $nextReview = $this->next_review_date?->format('Y-m-d');

        return [
            'id' => $this->id,
            'code' => $this->code,
            'sourceType' => $this->source_type,
            'category' => $this->category,
            'objective' => $this->objective,
            'description' => $this->description,
            'likelihood' => (int) $this->likelihood,
            'impact' => (int) $this->impact,
            'riskScore' => (int) $this->risk_score,
            'riskLevel' => $this->risk_level,
            'initialLikelihood' => (int) $this->initial_likelihood,
            'initialImpact' => (int) $this->initial_impact,
            'initialScore' => (int) $this->initial_score,
            'initialLevel' => $this->initial_level,
            'treatment' => $this->treatment,
            'expectedResult' => $this->expected_result,
            'ownerId' => $this->owner_id,
            'departmentId' => $this->department_id,
            'startDate' => $this->start_date?->format('Y-m-d'),
            'dueDate' => $this->due_date?->format('Y-m-d'),
            'reviewFrequency' => $this->review_frequency,
            'nextReviewDate' => $nextReview,
            'reviewStatus' => RiskSupport::reviewStatus($nextReview, $this->status),
            'status' => $this->status,
            'progress' => $this->whenLoaded('actions', fn () => $this->linkedProgress()),
            'actionCount' => $this->whenLoaded('actions', fn () => $this->actions->count()),
            'lastReviewedBy' => $this->last_reviewed_by,
            'lastReviewedAt' => $this->last_reviewed_at?->toIso8601String(),
            'lastReviewComment' => $this->last_review_comment,
            'createdBy' => $this->created_by,
            'updatedBy' => $this->updated_by,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
            'assessments' => RiskAssessmentResource::collection($this->whenLoaded('assessments')),
            'actions' => ActionResource::collection($this->whenLoaded('actions')),
        ];
    }

    /** Tiến độ trung bình của các Action liên kết (0 khi chưa có Action). */
    private function linkedProgress(): int
    {
        if ($this->actions->isEmpty()) {
            return 0;
        }

        return (int) round($this->actions->avg('progress'));
    }
}
