<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
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
}
