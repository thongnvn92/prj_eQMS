<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Lịch sử đánh giá rủi ro: dòng đầu = initial, các dòng sau = residual (re-evaluate). */
class RiskAssessment extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'risk_id', 'kind', 'likelihood', 'impact', 'score', 'level', 'assessed_by', 'comment', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'likelihood' => 'integer',
            'impact' => 'integer',
            'score' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (RiskAssessment $model) {
            if (empty($model->created_at)) {
                $model->created_at = now();
            }
        });
    }

    public function risk(): BelongsTo
    {
        return $this->belongsTo(Risk::class, 'risk_id');
    }

    public function assessor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assessed_by');
    }
}
