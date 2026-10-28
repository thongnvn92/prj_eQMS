<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AiProviderService;
use App\Services\AiSettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class AiSettingsController extends Controller
{
    public function show(AiSettingsService $settings): JsonResponse
    {
        return response()->json($settings->response());
    }

    public function update(Request $request, AiSettingsService $settings): JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['required', 'in:openai,gemini'],
            'apiKey' => ['sometimes', 'nullable', 'string', 'max:500'],
            'model' => ['required', 'string', 'max:120'],
            'enabled' => ['required', 'boolean'],
        ]);

        $current = $settings->stored();
        $providerChanged = $validated['provider'] !== $current['provider'];
        $providedKey = trim($validated['apiKey'] ?? '');
        $keyAfterUpdate = $providedKey !== '' && $providedKey !== '******'
            ? $providedKey
            : ($providerChanged ? '' : $current['apiKey']);
        if ($validated['enabled'] && $keyAfterUpdate === '') {
            return response()->json([
                'message' => 'Cần cấu hình API key trước khi bật tích hợp AI.',
                'errors' => ['apiKey' => ['Bắt buộc nhập API key.']],
            ], 422);
        }

        return response()->json($settings->update($validated));
    }

    public function test(Request $request, AiSettingsService $settings, AiProviderService $provider): JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['required', 'in:openai,gemini'],
            'apiKey' => ['sometimes', 'nullable', 'string', 'max:500'],
            'model' => ['required', 'string', 'max:120'],
        ]);

        $stored = $settings->stored();
        $apiKey = trim($validated['apiKey'] ?? '');
        if ($apiKey === '' || $apiKey === '******') {
            $apiKey = $validated['provider'] === $stored['provider'] ? $stored['apiKey'] : '';
        }
        if ($apiKey === '') {
            return response()->json([
                'message' => 'Cần nhập API key để kiểm tra kết nối.',
                'errors' => ['apiKey' => ['Bắt buộc nhập API key.']],
            ], 422);
        }

        return $this->analyzeResponse($provider, $validated['provider'], $validated['model'], $apiKey);
    }

    public function analyze(Request $request, AiSettingsService $settings, AiProviderService $provider): JsonResponse
    {
        $validated = $request->validate([
            'mode' => ['required', 'string', 'max:40'],
            'prompt' => ['required', 'string', 'max:30000'],
            'systemPrompt' => ['nullable', 'string', 'max:8000'],
        ]);
        $config = $settings->stored();

        if (! $config['enabled'] || trim($config['apiKey']) === '') {
            return response()->json(['message' => 'AI chưa được bật hoặc chưa cấu hình API key.'], 409);
        }

        try {
            $content = $provider->analyze(
                $config['provider'],
                $config['model'],
                $config['apiKey'],
                $validated['prompt'],
                $validated['systemPrompt'] ?? '',
            );
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 502);
        }

        if ($content === '') {
            return response()->json(['message' => 'Nhà cung cấp AI không trả về nội dung phân tích.'], 502);
        }

        return response()->json([
            'mode' => $validated['mode'],
            'provider' => $config['provider'],
            'model' => $config['model'],
            'content' => $content,
        ]);
    }

    private function analyzeResponse(
        AiProviderService $provider,
        string $providerName,
        string $model,
        string $apiKey,
    ): JsonResponse {
        try {
            $provider->analyze(
                $providerName,
                $model,
                $apiKey,
                'Hãy trả lời đúng một câu: "Kết nối AI thành công" để xác nhận.',
                '',
            );
        } catch (RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 502);
        }

        return response()->json(['message' => 'Kết nối AI thành công.']);
    }
}
