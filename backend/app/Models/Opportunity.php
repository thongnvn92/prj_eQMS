<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Opportunity extends BaseModel
{
    protected $fillable = [
        'code', 'source_type', 'category', 'objective', 'description',
        'feasibility', 'benefit', 'opportunity_score', 'opportunity_level',
        'solution', 'expected_result', 'actual_result', 'owner_id', 'department_id',
        'start_date', 'due_date',
        'review_frequency', 'next_review_date', 'status',
        'created_by', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'feasibility' => 'integer',
            'benefit' => 'integer',
            'opportunity_score' => 'integer',
            'start_date' => 'date',
            'due_date' => 'date',
            'next_review_date' => 'date',
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

    public function actions(): HasMany
    {
        return $this->hasMany(Action::class, 'related_opportunity_id');
    }
}
