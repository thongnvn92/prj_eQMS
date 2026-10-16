<?php

namespace App\Http\Resources;

use App\Models\DocumentFile;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * File đính kèm của tài liệu (revision kiểu SVN).
 *
 * @mixin DocumentFile
 */
class DocumentFileResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $file = $this->file;

        return [
            'id' => $this->id,
            'documentId' => $this->document_id,
            'documentVersionId' => $this->document_version_id,
            'revision' => (int) $this->revision,
            'changeNote' => $this->change_note,
            'originalName' => $file?->original_name,
            'mimeType' => $file?->mime_type,
            'size' => (int) ($file?->size ?? 0),
            'uploadedBy' => $this->created_by,
            'uploadedAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
