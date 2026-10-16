<?php

namespace App\Http\Resources;

use App\Models\DocumentVersion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin DocumentVersion */
class DocumentVersionResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'version' => $this->version,
            'changeSummary' => $this->change_summary,
            'createdBy' => $this->created_by,
            'createdAt' => $this->created_at?->format('Y-m-d'),
            'approvedBy' => $this->approved_by,
            'approvedAt' => $this->approved_at?->format('Y-m-d'),
            'isCurrent' => (bool) $this->is_current,
        ];
    }
}
