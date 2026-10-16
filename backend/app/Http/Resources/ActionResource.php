<?php

namespace App\Http\Resources;

use App\Models\Action;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Action -> contract `ActionItem` của FE.
 * - FE field `issue` (string) map từ cột `issue_description`.
 * - `source` là giá trị enum (audit_finding, ncr, ...).
 *
 * @mixin Action
 */
class ActionResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'title' => $this->title,
            'description' => $this->description,
            'source' => $this->source,
            'departmentId' => $this->department_id,
            'ownerId' => $this->owner_id,
            'issue' => $this->issue_description,
            'relatedDocumentId' => $this->related_document_id,
            'relatedTaskId' => $this->related_task_id,
            'dueDate' => $this->due_date?->format('Y-m-d'),
            'status' => $this->status,
            'progress' => (int) $this->progress,
            'result' => $this->result,
            'evidence' => $this->evidence,
            'relatedRiskId' => $this->related_risk_id,
            'relatedOpportunityId' => $this->related_opportunity_id,
        ];
    }
}
