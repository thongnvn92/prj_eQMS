<?php

namespace App\Models;

class Setting extends BaseModel
{
    protected $fillable = ['key', 'value'];

    protected function casts(): array
    {
        return [
            'value' => 'encrypted:array',
        ];
    }
}
