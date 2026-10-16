<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * User -> contract `SessionUser` của FE (dùng cho /login, /me).
 * KHÔNG lộ password / token.
 *
 * @mixin User
 */
class SessionUserResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $this->loadMissing('department', 'roles.permissions');

        return [
            'id' => $this->id,
            'username' => $this->username,
            'fullName' => $this->full_name,
            'departmentId' => $this->department_id,
            'departmentName' => $this->department?->name ?? '—',
            'roleCodes' => $this->roles->pluck('code')->values()->all(),
            'roleNames' => $this->roles->pluck('name')->values()->all(),
            'permissions' => $this->roles
                ->flatMap->permissions
                ->pluck('code')
                ->unique()
                ->values()
                ->all(),
        ];
    }
}
