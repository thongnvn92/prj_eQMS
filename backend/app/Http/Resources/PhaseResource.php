<?php

namespace App\Http\Resources;

use App\Models\MasterPlanPhase;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin MasterPlanPhase */
class PhaseResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'startDate' => $this->dateStr($this->start_date),
            'endDate' => $this->dateStr($this->end_date),
            // CR Master Plan ISO: phase thuộc kế hoạch nào → FE lọc công việc theo kế hoạch.
            'masterPlanId' => $this->master_plan_id,
        ];
    }

    /** Date -> 'Y-m-d' (null nếu rỗng) để khớp contract FE. */
    private function dateStr($date): ?string
    {
        return $date ? $date->format('Y-m-d') : null;
    }
}
