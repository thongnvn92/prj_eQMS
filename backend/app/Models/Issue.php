<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Issue extends BaseModel
{
    protected $fillable = [
        'code', 'title', 'description', 'reported_by', 'department_id', 'severity', 'status',
    ];

    public function reporter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reported_by');
    }

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function action(): HasMany
    {
        return $this->hasMany(Action::class, 'issue_id');
    }
}
