<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActivityLog extends BaseModel
{
    public $incrementing = true;

    // Bảng activity_logs chỉ có created_at (không có updated_at).
    public $timestamps = false;

    protected $fillable = [
        'user_id', 'action', 'entity', 'entity_id', 'old_status', 'new_status', 'properties', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (ActivityLog $log) {
            if (empty($log->created_at)) {
                $log->created_at = now();
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
