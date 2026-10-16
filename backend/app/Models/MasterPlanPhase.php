<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MasterPlanPhase extends BaseModel
{
    protected $fillable = [
        'master_plan_id', 'code', 'name', 'start_date', 'end_date', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
        ];
    }

    public function masterPlan(): BelongsTo
    {
        return $this->belongsTo(MasterPlan::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(MasterPlanTask::class, 'phase_id');
    }
}
