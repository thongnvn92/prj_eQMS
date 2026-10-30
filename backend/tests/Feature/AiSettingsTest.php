<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Services\AiProviderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Mockery\MockInterface;
use Tests\TestCase;

class AiSettingsTest extends TestCase
{
    use RefreshDatabase;

    private function createUserWithPermission(string $username, string $permissionCode): User
    {
        $user = User::create([
            'username' => $username,
            'full_name' => ucfirst($username),
            'email' => $username.'@example.test',
            'password' => 'password',
            'is_active' => true,
        ]);
        $role = Role::create(['code' => $username.'-role', 'name' => ucfirst($username)]);
        $permission = Permission::create([
            'code' => $permissionCode,
            'module' => explode('.', $permissionCode)[0],
            'action' => explode('.', $permissionCode)[1],
        ]);
        $role->permissions()->attach($permission->id);
        $user->roles()->attach($role->id);

        return $user;
    }

    public function test_admin_can_save_encrypted_settings_and_only_read_a_masked_api_key(): void
    {
        $admin = $this->createUserWithPermission('ai-admin', 'role.manage');
        $payload = [
            'provider' => 'openai',
            'apiKey' => 'secret-openai-key',
            'model' => 'gpt-4o-mini',
            'enabled' => true,
        ];

        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/admin/settings/ai', $payload)
            ->assertOk()
            ->assertJsonPath('apiKey', '******')
            ->assertJsonPath('apiKeyConfigured', true);

        $stored = DB::table('settings')->where('key', 'ai')->value('value');
        $this->assertStringNotContainsString('secret-openai-key', $stored);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/admin/settings/ai')
            ->assertOk()
            ->assertJsonPath('provider', 'openai')
            ->assertJsonPath('apiKey', '******')
            ->assertJsonPath('apiKeyConfigured', true);

        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/admin/settings/ai', [
                'provider' => 'openai',
                'model' => 'gpt-4o',
                'enabled' => true,
            ])
            ->assertOk()
            ->assertJsonPath('model', 'gpt-4o')
            ->assertJsonPath('apiKey', '******');

        $this->assertSame('secret-openai-key', Setting::query()->where('key', 'ai')->firstOrFail()->value['apiKey']);
    }

    public function test_enabling_ai_without_a_key_does_not_save_invalid_settings(): void
    {
        $admin = $this->createUserWithPermission('ai-admin', 'role.manage');

        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/admin/settings/ai', [
                'provider' => 'gemini',
                'model' => 'gemini-3.8-flash',
                'enabled' => true,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['apiKey']);

        $this->assertDatabaseCount('settings', 0);
    }

    public function test_dashboard_ai_analysis_uses_the_saved_provider_configuration(): void
    {
        $admin = $this->createUserWithPermission('ai-admin', 'role.manage');
        $analyst = $this->createUserWithPermission('ai-analyst', 'dashboard.view');
        Http::fake([
            'api.openai.com/v1/chat/completions' => Http::response([
                'choices' => [['message' => ['content' => 'Backend analysis']]],
            ]),
        ]);

        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/admin/settings/ai', [
                'provider' => 'openai',
                'apiKey' => 'saved-openai-key',
                'model' => 'gpt-4o-mini',
                'enabled' => true,
            ])
            ->assertOk();

        $this->actingAs($analyst, 'sanctum')
            ->getJson('/api/ai/settings')
            ->assertOk()
            ->assertJsonPath('apiKey', '******')
            ->assertJsonPath('apiKeyConfigured', true);

        $this->actingAs($analyst, 'sanctum')
            ->postJson('/api/ai/analyze', [
                'mode' => 'executive',
                'prompt' => 'Dashboard prompt',
                'systemPrompt' => 'System prompt',
            ])
            ->assertOk()
            ->assertJson([
                'mode' => 'executive',
                'provider' => 'openai',
                'model' => 'gpt-4o-mini',
                'content' => 'Backend analysis',
            ]);

        Http::assertSent(fn (ClientRequest $request) => $request->url() === 'https://api.openai.com/v1/chat/completions'
            && $request->hasHeader('Authorization', 'Bearer saved-openai-key')
            && $request['messages'][1]['content'] === 'Dashboard prompt'
        );
    }

    public function test_gemini_analysis_retries_a_transient_response_and_keeps_key_out_of_url(): void
    {
        $admin = $this->createUserWithPermission('gemini-admin', 'role.manage');
        $analyst = $this->createUserWithPermission('gemini-analyst', 'dashboard.view');
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::sequence()
                ->push(['error' => ['message' => 'Rate limited']], 429)
                ->push([
                    'candidates' => [['content' => ['parts' => [['text' => 'Gemini analysis']]]]],
                ]),
        ]);

        $this->actingAs($admin, 'sanctum')
            ->putJson('/api/admin/settings/ai', [
                'provider' => 'gemini',
                'apiKey' => 'saved-gemini-key',
                'model' => 'gemini-3.8-flash',
                'enabled' => true,
            ])
            ->assertOk();

        $this->actingAs($analyst, 'sanctum')
            ->postJson('/api/ai/analyze', [
                'mode' => 'executive',
                'prompt' => 'Dashboard prompt',
            ])
            ->assertOk()
            ->assertJsonPath('content', 'Gemini analysis');

        Http::assertSentCount(2);
        Http::assertSent(fn (ClientRequest $request) => str_contains($request->url(), 'models/gemini-3.8-flash:generateContent')
            && ! str_contains($request->url(), 'saved-gemini-key')
            && $request->hasHeader('x-goog-api-key', 'saved-gemini-key')
        );
    }

    public function test_gemini_connection_check_returns_service_unavailable_without_exceeding_gateway_timeout(): void
    {
        $admin = $this->createUserWithPermission('gemini-admin', 'role.manage');
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::sequence()
                ->push(['error' => ['message' => 'Service unavailable']], 503)
                ->push(['error' => ['message' => 'Service unavailable']], 503)
                ->push(['error' => ['message' => 'Service unavailable']], 503)
                ->push(['error' => ['message' => 'Service unavailable']], 503),
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/settings/ai/test', [
                'provider' => 'gemini',
                'apiKey' => 'test-gemini-key',
                'model' => 'gemini-3.8-flash',
            ])
            ->assertStatus(502)
            ->assertJsonPath(
                'message',
                'Gemini đang tạm thời quá tải hoặc không khả dụng (HTTP 503). Vui lòng đợi một lúc rồi kiểm tra lại kết nối.',
            );

        Http::assertSentCount(1);
    }

    public function test_connection_check_uses_timeout_and_attempts_from_configuration(): void
    {
        $admin = $this->createUserWithPermission('gemini-admin', 'role.manage');
        config([
            'services.ai_settings.timeout' => 9,
            'services.ai_settings.max_attempts' => 2,
        ]);
        $this->mock(AiProviderService::class, function (MockInterface $mock): void {
            $mock->shouldReceive('analyze')
                ->once()
                ->with(
                    'gemini',
                    'gemini-3.8-flash',
                    'test-gemini-key',
                    'Hãy trả lời đúng một câu: "Kết nối AI thành công" để xác nhận.',
                    '',
                    9,
                    2,
                )
                ->andReturn('Kết nối AI thành công');
        });

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/admin/settings/ai/test', [
                'provider' => 'gemini',
                'apiKey' => 'test-gemini-key',
                'model' => 'gemini-3.8-flash',
            ])
            ->assertOk()
            ->assertJsonPath('message', 'Kết nối AI thành công.');
    }

    public function test_settings_api_requires_role_manage_permission(): void
    {
        $user = User::create([
            'username' => 'regular-user',
            'full_name' => 'Regular User',
            'email' => 'regular@example.test',
            'password' => 'password',
            'is_active' => true,
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/admin/settings/ai')
            ->assertForbidden();
    }

    public function test_settings_read_failure_is_logged_and_returns_cors_enabled_json_error(): void
    {
        $admin = $this->createUserWithPermission('ai-admin', 'role.manage');
        Setting::query()->create([
            'key' => 'ai',
            'value' => [
                'provider' => 'openai',
                'model' => 'gpt-4o-mini',
                'enabled' => false,
                'apiKey' => '',
            ],
        ]);
        DB::table('settings')->where('key', 'ai')->update(['value' => 'invalid-encrypted-data']);
        config(['cors.allowed_origins' => ['https://qms.nao.cloud']]);
        Log::shouldReceive('error')
            ->once()
            ->withArgs(fn (string $message, array $context): bool => $message === 'Unable to load AI settings.'
                && isset($context['exception']));

        $this->actingAs($admin, 'sanctum')
            ->withHeaders(['Origin' => 'https://qms.nao.cloud'])
            ->getJson('/api/admin/settings/ai')
            ->assertStatus(500)
            ->assertJsonPath('message', 'Không thể tải cấu hình AI lúc này. Vui lòng liên hệ quản trị viên.')
            ->assertHeader('Access-Control-Allow-Origin', 'https://qms.nao.cloud');
    }
}
