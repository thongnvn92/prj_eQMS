<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ActionEvidence extends BaseModel
{
    // Khai báo tường minh: Str::plural("ActionEvidence") suy ra "action_evidence"
    // (Doctrine coi "evidence" là uncountable) trong khi bảng thật là "action_evidences".
    protected $table = 'action_evidences';

    protected $fillable = ['action_id', 'file_id', 'note'];

    public function action(): BelongsTo
    {
        return $this->belongsTo(Action::class);
    }

    public function file(): BelongsTo
    {
        return $this->belongsTo(File::class);
    }
}
