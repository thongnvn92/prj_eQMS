<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Document extends BaseModel
{
    protected $fillable = [
        'code', 'name', 'doc_type', 'department_id', 'owner_id', 'current_version',
        'status', 'status_updated_at', 'auto_version', 'workflow_step', 'related_task_id', 'description', 'effective_date',
    ];

    protected function casts(): array
    {
        return [
            'effective_date' => 'date',
            'status_updated_at' => 'datetime',
            'auto_version' => 'boolean',
        ];
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function relatedTask(): BelongsTo
    {
        return $this->belongsTo(MasterPlanTask::class, 'related_task_id');
    }

    public function versions(): HasMany
    {
        return $this->hasMany(DocumentVersion::class, 'document_id');
    }

    public function approvals(): HasMany
    {
        return $this->hasMany(DocumentApproval::class, 'document_id');
    }

    public function files(): HasMany
    {
        return $this->hasMany(DocumentFile::class, 'document_id');
    }
}
