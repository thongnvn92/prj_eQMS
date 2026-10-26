<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiAnalysis extends BaseModel
{
    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'mode',
        'provider',
        'model',
        'content',
        'analyzed_at',
    ];

    protected function casts(): array
    {
        return [
            'analyzed_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
