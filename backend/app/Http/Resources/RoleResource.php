<?php

namespace App\Http\Resources;

use App\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Role cho màn hình Admin (RoleItem) – camelCase, kèm permissions[].
 *
 * @mixin Role
 */
class RoleResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $this->loadMissing('permissions');

        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->name,
            'description' => $this->description,
            // FE (AdminPage RoleRow) đọc `permissions: string[]` (danh sách permission code).
            'permissions' => $this->permissions->pluck('code')->values()->all(),
        ];
    }
}
