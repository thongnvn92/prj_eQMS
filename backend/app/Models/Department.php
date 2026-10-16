<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\HasMany;

class Department extends BaseModel
{
    protected $fillable = ['code', 'name', 'description', 'is_active'];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(MasterPlanTask::class, 'department_id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(Document::class, 'department_id');
    }
}
