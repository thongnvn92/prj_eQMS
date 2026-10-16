<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MasterPlan extends BaseModel
{
    protected $fillable = [
        'code', 'name', 'cycle_label', 'start_date', 'end_date', 'status', 'description', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
        ];
    }

    public function phases(): HasMany
    {
        return $this->hasMany(MasterPlanPhase::class, 'master_plan_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
