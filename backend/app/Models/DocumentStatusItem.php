<?php

namespace App\Models;

/**
 * Dictionary trạng thái tài liệu (bảng document_statuses) – admin CRUD tại /admin.
 * 9 trạng thái workflow chuẩn có is_system=true (không xóa được).
 */
class DocumentStatusItem extends BaseModel
{
    protected $table = 'document_statuses';

    protected $fillable = [
        'code', 'label', 'color', 'sort_order', 'is_active', 'is_system',
    ];

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_active' => 'boolean',
            'is_system' => 'boolean',
        ];
    }
}