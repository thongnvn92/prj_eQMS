<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class PermissionMiddleware
{
    /**
     * Handle incoming request.
     * Hỗ trợ "permission:a" hoặc "permission:a|b" (chỉ cần 1 trong các quyền).
     *
     * Xác thực bằng guard "sanctum" (Bearer Token) – KHÔNG dùng session guard "web".
     * Lưu ý: các route dùng middleware này cũng được bọc bởi "auth:sanctum".
     */
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = Auth::guard('sanctum')->user();

        if (! $user) {
            return response()->json([
                'status' => 'error',
                'message' => 'Bạn cần đăng nhập để thực hiện thao tác này.',
            ], 401);
        }

        $required = array_filter(explode('|', $permission));
        $has = false;
        foreach ($required as $perm) {
            if ($this->hasPermission($user, $perm)) {
                $has = true;
                break;
            }
        }

        if (! $has) {
            return response()->json([
                'status' => 'error',
                'message' => 'Bạn không có quyền thực hiện thao tác này.',
            ], 403);
        }

        return $next($request);
    }

    public function hasPermission($user, string $permission): bool
    {
        $user->loadMissing('roles.permissions');

        $permissions = collect();
        foreach ($user->roles as $role) {
            $permissions = $permissions->merge($role->permissions->pluck('code'));
        }

        return $permissions->contains($permission);
    }
}
