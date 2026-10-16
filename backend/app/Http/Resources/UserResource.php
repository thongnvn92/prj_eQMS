<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * User cho màn hình Admin (UserItem) – camelCase.
 * KHÔNG lộ password / remember_token.
 *
 * @mixin User
 */
class UserResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $this->loadMissing('department', 'roles');

        return [
            'id' => $this->id,
            'username' => $this->username,
            'fullName' => $this->full_name,
            'email' => $this->email,
            'departmentId' => $this->department_id,
            'departmentName' => $this->department?->name,
            'active' => (bool) $this->is_active,
            'roleCodes' => $this->roles->pluck('code')->values()->all(),
            'roleNames' => $this->roles->pluck('name')->values()->all(),
            'lastLoginAt' => $this->last_login_at?->toIso8601String(),
            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
