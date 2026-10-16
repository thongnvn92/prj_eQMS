<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Bản ghi file đính kèm của tài liệu (revision kiểu SVN).
 * Mỗi DocumentFile trỏ tới 1 File vật lý + revision tự tăng trong version.
 */
class DocumentFile extends BaseModel
{
    protected $fillable = [
        'document_id', 'document_version_id', 'file_id', 'revision', 'change_note', 'created_by',
    ];

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function version(): BelongsTo
    {
        return $this->belongsTo(DocumentVersion::class, 'document_version_id');
    }

    public function file(): BelongsTo
    {
        return $this->belongsTo(File::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
