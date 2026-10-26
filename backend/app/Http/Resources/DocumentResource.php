<?php

namespace App\Http\Resources;

use App\Models\Document;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Document -> contract `DocumentItem` của FE (bao gồm versions[], approvals[]).
 *
 * @mixin Document
 */
class DocumentResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'docType' => $this->doc_type,
            'departmentId' => $this->department_id,
            'ownerId' => $this->owner_id,
            'ownerName' => $this->owner_name,
            'currentVersion' => $this->current_version,
            'status' => $this->status,
            'statusUpdatedAt' => $this->status_updated_at?->toIso8601String(),
            'autoVersion' => (bool) $this->auto_version,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
            'workflowStep' => (int) $this->workflow_step,
            'relatedTaskId' => $this->related_task_id,
            'description' => $this->description,
            'effectiveDate' => $this->effective_date?->format('Y-m-d'),
            'versions' => DocumentVersionResource::collection($this->whenLoaded('versions', collect())),
            'approvals' => DocumentApprovalResource::collection($this->whenLoaded('approvals', collect())),
            'files' => DocumentFileResource::collection($this->whenLoaded('files', collect())),
        ];
    }
}
