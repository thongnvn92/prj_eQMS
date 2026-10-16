<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MasterPlanDependency extends BaseModel
{
    protected $table = 'master_plan_dependencies';

    protected $fillable = [
        'master_plan_id',
        'predecessor_task_id',
        'successor_task_id',
        'dependency_type',
        'lag_days',
        'sequence',
    ];

    protected $casts = [
        'lag_days' => 'integer',
        'sequence' => 'integer',
    ];

    public function masterPlan(): BelongsTo
    {
        return $this->belongsTo(MasterPlan::class);
    }

    public function predecessor(): BelongsTo
    {
        return $this->belongsTo(MasterPlanTask::class, 'predecessor_task_id');
    }

    public function successor(): BelongsTo
    {
        return $this->belongsTo(MasterPlanTask::class, 'successor_task_id');
    }
}
