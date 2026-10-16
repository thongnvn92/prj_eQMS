<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class File extends BaseModel
{
    protected $fillable = ['disk', 'path', 'original_name', 'mime_type', 'size', 'uploaded_by'];

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function documentVersions(): HasMany
    {
        return $this->hasMany(DocumentVersion::class, 'file_id');
    }

    public function actionEvidences(): HasMany
    {
        return $this->hasMany(ActionEvidence::class, 'file_id');
    }
}
