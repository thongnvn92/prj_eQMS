<?php

namespace App\Models;

use App\Models\MasterPlan;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MasterPlanTask extends BaseModel
{
    protected $fillable = [
        'phase_id', 'parent_id', 'sort_order', 'code', 'name', 'owner_id', 'owner_name', 'department_id', 'priority', 'status',
        'progress', 'start_date', 'due_date', 'result', 'note', 'dependency_id', 'risk_level',
        'year', 'quarter', 'month',
        'is_milestone',
        'planned_start_date', 'planned_end_date', 'actual_start_date', 'actual_end_date',
        'duration',
        'constraint_type', 'constraint_date',
        'baseline_start_date', 'baseline_end_date', 'baseline_progress',
    ];

    protected function casts(): array
    {
        return [
            'progress' => 'integer',
            'sort_order' => 'integer',
            'is_milestone' => 'boolean',
            'duration' => 'integer',
            'baseline_progress' => 'integer',
            'start_date' => 'date',
            'due_date' => 'date',
            'planned_start_date' => 'date',
            'planned_end_date' => 'date',
            'actual_start_date' => 'date',
            'actual_end_date' => 'date',
        ];
    }

    public function masterPlan(): BelongsTo
    {
        return $this->belongsTo(MasterPlan::class);
    }

    public function predecessors(): HasMany
    {
        return $this->hasMany(MasterPlanDependency::class, 'predecessor_task_id')->orderBy('sequence');
    }

    public function successors(): HasMany
    {
        return $this->hasMany(MasterPlanDependency::class, 'successor_task_id')->orderBy('sequence');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(MasterPlanTask::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(MasterPlanTask::class, 'parent_id')->orderBy('sort_order');
    }

    /** Legacy single predecessor reference (kept for backward compatibility). */
    public function dependency(): BelongsTo
    {
        return $this->belongsTo(MasterPlanTask::class, 'dependency_id');
    }
}
