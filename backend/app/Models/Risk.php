<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Risk extends BaseModel
{
    protected $fillable = [
        'code', 'source_type', 'category', 'objective', 'description',
        'likelihood', 'impact', 'risk_score', 'risk_level',
        'initial_likelihood', 'initial_impact', 'initial_score', 'initial_level',
        'treatment', 'expected_result', 'owner_id', 'department_id',
        'start_date', 'due_date', 'review_frequency', 'next_review_date', 'status',
        'last_reviewed_by', 'last_reviewed_at', 'last_review_comment',
        'created_by', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'likelihood' => 'integer',
            'impact' => 'integer',
            'risk_score' => 'integer',
            'initial_likelihood' => 'integer',
            'initial_impact' => 'integer',
            'initial_score' => 'integer',
            'start_date' => 'date',
            'due_date' => 'date',
            'next_review_date' => 'date',
            'last_reviewed_at' => 'datetime',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function assessments(): HasMany
    {
        return $this->hasMany(RiskAssessment::class, 'risk_id');
    }

    public function actions(): HasMany
    {
        return $this->hasMany(Action::class, 'related_risk_id');
    }
}
