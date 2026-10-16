<?php

namespace App\Http\Resources;

use App\Models\MasterPlan;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * MasterPlan -> contract FE. Bao gồm số lượng phase/task con.
 *
 * @mixin MasterPlan
 */
class MasterPlanResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'cycleLabel' => $this->cycle_label,
            'startDate' => $this->start_date?->format('Y-m-d'),
            'endDate' => $this->end_date?->format('Y-m-d'),
            'status' => $this->status,
            'description' => $this->description,
            'createdBy' => $this->created_by,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }
}
