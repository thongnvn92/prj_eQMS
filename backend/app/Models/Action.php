<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Action extends BaseModel
{
    protected $fillable = [
        'code', 'title', 'description', 'source', 'issue_id', 'department_id', 'owner_id',
        'issue_description', 'related_document_id', 'related_task_id', 'due_date', 'status', 'progress', 'result', 'evidence',
        'related_risk_id', 'related_opportunity_id',
    ];

    protected function casts(): array
    {
        return [
            'progress' => 'integer',
            'due_date' => 'date',
        ];
    }

    public function issue(): BelongsTo
    {
        return $this->belongsTo(Issue::class);
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function relatedDocument(): BelongsTo
    {
        return $this->belongsTo(Document::class, 'related_document_id');
    }

    public function relatedTask(): BelongsTo
    {
        return $this->belongsTo(MasterPlanTask::class, 'related_task_id');
    }

    public function evidences(): HasMany
    {
        return $this->hasMany(ActionEvidence::class, 'action_id');
    }

    public function relatedRisk(): BelongsTo
    {
        return $this->belongsTo(Risk::class, 'related_risk_id');
    }

    public function relatedOpportunity(): BelongsTo
    {
        return $this->belongsTo(Opportunity::class, 'related_opportunity_id');
    }
}
