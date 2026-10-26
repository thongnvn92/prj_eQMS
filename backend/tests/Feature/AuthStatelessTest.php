<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

/**
 * Task 01 – Xác thực stateless bằng Laravel Sanctum Bearer Token.
 *
 * Lưu ý: test KHÔNG dùng RefreshDatabase để tránh xóa dữ liệu dev.
 * Dùng user đã seed (leader / user / admin) và tự dọn token tạo ra trong tearDown.
 */
class AuthStatelessTest extends TestCase
{
    private array $createdTokenIds = [];

    protected function tearDown(): void
    {
        if (! empty($this->createdTokenIds)) {
            PersonalAccessToken::whereIn('id', $this->createdTokenIds)->delete();
        }
        $this->createdTokenIds = [];

        parent::tearDown();
    }

    private function login(string $username, string $password): array
    {
        $response = $this->postJson('/api/login', [
            'username' => $username,
            'password' => $password,
        ]);

        $data = $response->json();
        if (! empty($data['token'])) {
            // Ghi nhận token id để dọn dẹp (định dạng "id|plainText").
            $id = (int) explode('|', $data['token'])[0];
            if ($id > 0) {
                $this->createdTokenIds[] = $id;
            }
        }

        return [$response, $data];
    }

    public function test_login_success_returns_token_and_session_user(): void
    {
        [$response, $data] = $this->login('leader', 'Leader123!');

        $response->assertOk();
        $this->assertArrayHasKey('token', $data);
        $this->assertArrayHasKey('user', $data);

        $user = $data['user'];
        // Contract SessionUser (camelCase) của frontend.
        $this->assertSame('leader', $user['username']);
        $this->assertSame('Trần Văn Long', $user['fullName']);
        $this->assertArrayHasKey('departmentName', $user);
        $this->assertContains('iso_leader', $user['roleCodes']);
        $this->assertContains('master_plan.view', $user['permissions']);
        // KHÔNG được lộ password / token nội bộ.
        $this->assertArrayNotHasKey('password', $user);
        $this->assertArrayNotHasKey('remember_token', $user);
    }

    public function test_login_updates_last_login_at(): void
    {
        $user = User::where('username', 'leader')->firstOrFail();
        $user->forceFill(['last_login_at' => null])->save();

        [$response] = $this->login('leader', 'Leader123!');

        $response->assertOk();
        $this->assertNotNull($user->fresh()->last_login_at);
    }

    public function test_login_writes_activity_log(): void
    {
        [$response] = $this->login('leader', 'Leader123!');
        $response->assertOk();

        $this->assertDatabaseHas('activity_logs', [
            'action' => 'login',
            'entity' => 'user',
        ]);
    }

    public function test_login_fails_with_wrong_password_returns_401(): void
    {
        [$response, $data] = $this->login('leader', 'WRONG_PASSWORD');

        $response->assertStatus(401);
        $this->assertSame('error', $data['status']);
        $this->assertArrayNotHasKey('token', $data);
    }

    public function test_login_fails_with_unknown_user_returns_401(): void
    {
        [$response, $data] = $this->login('khong_ton_tai', 'whatever');

        $response->assertStatus(401);
        $this->assertSame('error', $data['status']);
        $this->assertArrayNotHasKey('token', $data);
    }

    public function test_login_validation_error_returns_422(): void
    {
        $response = $this->postJson('/api/login', ['username' => 'leader']);

        $response->assertStatus(422);
        $response->assertJson(['status' => 'error']);
        $response->assertJsonValidationErrors(['password']);
    }

    public function test_login_requires_username(): void
    {
        $response = $this->postJson('/api/login', ['password' => 'Leader123!']);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['username']);
    }

    public function test_login_empty_body_requires_both_credentials(): void
    {
        $response = $this->postJson('/api/login', []);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['username', 'password']);
    }

    public function test_me_with_valid_token_returns_session_user_directly(): void
    {
        [, $data] = $this->login('leader', 'Leader123!');

        $response = $this->withHeaders([
            'Authorization' => 'Bearer '.$data['token'],
            'Accept' => 'application/json',
        ])->getJson('/api/me');

        $response->assertOk();
        $body = $response->json();
        // /me trả trực tiếp SessionUser – KHÔNG bọc { user }.
        $this->assertSame('leader', $body['username']);
        $this->assertArrayNotHasKey('user', $body);
        $this->assertArrayNotHasKey('password', $body);
    }

    public function test_me_without_token_returns_401(): void
    {
        $response = $this->withHeaders(['Accept' => 'application/json'])->getJson('/api/me');

        $response->assertStatus(401);
        $response->assertJson(['status' => 'error']);
    }

    public function test_me_with_invalid_token_returns_401(): void
    {
        $response = $this->withHeaders([
            'Authorization' => 'Bearer invalid.token.value',
            'Accept' => 'application/json',
        ])->getJson('/api/me');

        $response->assertStatus(401);
        $response->assertJson(['status' => 'error']);
    }

    public function test_protected_endpoint_without_token_returns_401(): void
    {
        $response = $this->withHeaders(['Accept' => 'application/json'])->getJson('/api/dashboard');

        $response->assertStatus(401);
    }

    public function test_permission_middleware_returns_403_when_missing_permission(): void
    {
        // "user" (normal_user) không có quyền user.view -> /admin/users phải 403.
        [, $data] = $this->login('user', 'User123!');

        $response = $this->withHeaders([
            'Authorization' => 'Bearer '.$data['token'],
            'Accept' => 'application/json',
        ])->getJson('/api/admin/users');

        $response->assertStatus(403);
        $response->assertJson(['status' => 'error']);
    }

    public function test_permission_middleware_allows_when_has_permission(): void
    {
        // "admin" (super_admin) có quyền user.view -> /admin/users phải 200.
        [, $data] = $this->login('admin', 'Admin123!');

        $response = $this->withHeaders([
            'Authorization' => 'Bearer '.$data['token'],
            'Accept' => 'application/json',
        ])->getJson('/api/admin/users');

        $response->assertOk();
    }

    public function test_login_inactive_account_returns_403(): void
    {
        // Task 06: tài khoản bị khóa (is_active=false) → 403, không cấp token.
        DB::beginTransaction();
        try {
            $user = User::where('username', 'auditor')->firstOrFail();
            $user->forceFill(['is_active' => false])->save();

            $response = $this->postJson('/api/login', [
                'username' => 'auditor',
                'password' => 'Audit123!',
            ]);

            $response->assertStatus(403);
            $this->assertSame('error', $response->json('status'));
            $this->assertArrayNotHasKey('token', $response->json());
        } finally {
            DB::rollBack();
        }
    }
}
