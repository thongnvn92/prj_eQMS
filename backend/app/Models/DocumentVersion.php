<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DocumentVersion extends BaseModel
{
    protected $fillable = [
        'document_id', 'file_id', 'version', 'change_summary', 'created_by', 'approved_by', 'approved_at', 'is_current',
    ];

    protected function casts(): array
    {
        return [
            'approved_at' => 'datetime',
            'is_current' => 'boolean',
        ];
    }

    public function document(): BelongsTo
    {
        return $this->belongsTo(Document::class);
    }

    public function file(): BelongsTo
    {
        return $this->belongsTo(File::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
