<?php

namespace App\Http\Resources;

use App\Models\Opportunity;
use App\Support\RiskSupport;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Opportunity -> contract `OpportunityItem` của FE (camelCase).
 *
 * @mixin Opportunity
 */
class OpportunityResource extends JsonResource
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
            'feasibility' => (int) $this->feasibility,
            'benefit' => (int) $this->benefit,
            'opportunityScore' => (int) $this->opportunity_score,
            'opportunityLevel' => $this->opportunity_level,
            'solution' => $this->solution,
            'expectedResult' => $this->expected_result,
            'actualResult' => $this->actual_result,
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
            'createdBy' => $this->created_by,
            'updatedBy' => $this->updated_by,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
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
