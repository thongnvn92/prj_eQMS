<?php

namespace App\Http\Controllers\Api;

use App\Enums\LogEntity;
use App\Http\Controllers\Controller;
use App\Http\Resources\SessionUserResource;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    /**
     * Đăng nhập STATELESS bằng Sanctum Bearer Token.
     * - Không dùng Auth::attempt() / session guard.
     * - Xác thực username/password bằng Hash::check.
     * - Cập nhật last_login_at + ghi activity log.
     * - Trả { token, user } với user khớp SessionUser của frontend.
     */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('username', $data['username'])->first();

        // Không tiết lộ user tồn tại hay không; thông báo chung.
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Tên đăng nhập hoặc mật khẩu không đúng.',
            ], 401);
        }

        if (! $user->is_active) {
            return response()->json([
                'status' => 'error',
                'message' => 'Tài khoản đã bị khóa.',
            ], 403);
        }

        // Cập nhật thời điểm đăng nhập cuối.
        $user->forceFill(['last_login_at' => now()])->save();

        // Ghi activity log đăng nhập (schema: activity_logs chỉ có created_at).
        ActivityLog::create([
            'user_id' => $user->id,
            'action' => 'login',
            'entity' => LogEntity::User->value,
            'entity_id' => $user->id,
            'new_status' => 'success',
        ]);

        // Sinh Bearer token (plainTextToken chỉ trả về đúng 1 lần này).
        $token = $user->createToken('eqms-session')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => new SessionUserResource($user),
        ]);
    }

    /**
     * Trả thông tin user hiện tại từ Bearer Token (guard sanctum).
     * KHÔNG bọc thêm { user } – trả trực tiếp SessionUser.
     */
    public function me(Request $request): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();

        if (! $user) {
            return response()->json([
                'status' => 'error',
                'message' => 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
            ], 401);
        }

        // SessionUserResource resolve về mảng phẳng (không bọc { data }/{ user }).
        return response()->json(new SessionUserResource($user));
    }
}
