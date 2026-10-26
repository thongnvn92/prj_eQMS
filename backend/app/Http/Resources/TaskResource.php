<?php

namespace App\Http\Resources;

use App\Models\MasterPlanTask;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Task Master Plan -> contract `Task` của FE.
 *
 * @mixin MasterPlanTask
 */
class TaskResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'phaseId' => $this->phase_id,
            'parentId' => $this->parent_id,
            'sortOrder' => (int) $this->sort_order,
            'ownerId' => $this->owner_id,
            'ownerName' => $this->owner_name,
            'departmentId' => $this->department_id,
            'priority' => $this->priority,
            'status' => $this->status,
            'progress' => (int) $this->progress,
            'startDate' => $this->start_date?->format('Y-m-d'),
            'dueDate' => $this->due_date?->format('Y-m-d'),
            'result' => $this->result,
            'note' => $this->note,
        ];
    }
}
