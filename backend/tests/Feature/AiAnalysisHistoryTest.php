<?php

namespace Tests\Feature;

use App\Models\AiAnalysis;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AiAnalysisHistoryTest extends TestCase
{
    use RefreshDatabase;

    private function createUser(string $username): User
    {
        return User::create([
            'username' => $username,
            'full_name' => ucfirst($username),
            'email' => $username.'@example.test',
            'password' => 'password',
            'is_active' => true,
        ]);
    }

    public function test_authenticated_user_can_save_and_read_own_analysis(): void
    {
        $user = $this->createUser('analyst');
        $payload = [
            'mode' => 'executive',
            'provider' => 'gemini',
            'model' => 'gemini-3.8-flash',
            'content' => "## Phân tích\n\n- Công việc đang chậm.",
        ];

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/ai/analyses', $payload)
            ->assertCreated()
            ->assertJsonPath('mode', 'executive')
            ->assertJsonPath('provider', 'gemini')
            ->assertJsonPath('content', $payload['content'])
            ->assertJsonStructure(['id', 'mode', 'provider', 'model', 'content', 'analyzedAt']);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/ai/analyses')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.content', $payload['content']);
    }

    public function test_history_returns_only_the_latest_ten_analyses_for_current_user(): void
    {
        $user = $this->createUser('analyst');
        $otherUser = $this->createUser('another-analyst');

        for ($i = 1; $i <= 12; $i++) {
            AiAnalysis::create([
                'user_id' => $user->id,
                'mode' => 'executive',
                'provider' => 'openai',
                'model' => 'gpt-4o-mini',
                'content' => "Result {$i}",
                'analyzed_at' => now()->subMinutes($i),
            ]);
        }

        AiAnalysis::create([
            'user_id' => $otherUser->id,
            'mode' => 'executive',
            'provider' => 'openai',
            'model' => 'gpt-4o-mini',
            'content' => 'Private result',
            'analyzed_at' => now(),
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/ai/analyses');

        $response->assertOk()->assertJsonCount(10);
        $this->assertSame('Result 1', $response->json('0.content'));
        $this->assertSame('Result 10', $response->json('9.content'));
        $this->assertStringNotContainsString('Private result', $response->getContent());
    }

    public function test_analysis_requires_supported_provider_and_content(): void
    {
        $user = $this->createUser('analyst');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/ai/analyses', [
                'mode' => 'executive',
                'provider' => 'claude',
                'model' => 'unsupported',
                'content' => 'Result',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['provider']);
    }

    public function test_analysis_content_is_limited_to_fit_text_column(): void
    {
        $user = $this->createUser('analyst');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/ai/analyses', [
                'mode' => 'executive',
                'provider' => 'gemini',
                'model' => 'gemini-3.8-flash',
                'content' => str_repeat('x', 16001),
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['content']);
    }
}
