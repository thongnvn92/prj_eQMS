<?php

namespace App\Http\Resources;

use App\Models\DocumentApproval;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin DocumentApproval */
class DocumentApprovalResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'version' => $this->version,
            'step' => $this->step,
            'approverId' => $this->approver_id,
            'action' => $this->action,
            'comment' => $this->comment,
            'decidedAt' => $this->decided_at?->format('Y-m-d'),
        ];
    }
}
