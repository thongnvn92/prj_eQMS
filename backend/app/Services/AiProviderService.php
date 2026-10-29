<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class AiProviderService
{
    public function analyze(
        string $provider,
        string $model,
        string $apiKey,
        string $prompt,
        string $systemPrompt,
    ): string {
        if ($provider === 'openai') {
            $response = $this->sendWithRetry(fn () => Http::timeout(60)
                ->withToken($apiKey)
                ->post('https://api.openai.com/v1/chat/completions', [
                    'model' => $model,
                    'temperature' => 0.4,
                    'messages' => [
                        ['role' => 'system', 'content' => $systemPrompt],
                        ['role' => 'user', 'content' => $prompt],
                    ],
                ]));

            $this->ensureSuccessful($response, 'OpenAI');
            $responseContent = $response->json('choices.0.message.content');
            $content = is_string($responseContent) ? trim($responseContent) : '';
            if ($content === '') {
                throw new RuntimeException('OpenAI không trả về nội dung phân tích.');
            }

            return $content;
        }

        $response = $this->sendWithRetry(fn () => Http::timeout(60)
            ->withHeaders(['x-goog-api-key' => $apiKey])
            ->post(
                'https://generativelanguage.googleapis.com/v1beta/models/'.rawurlencode($model).':generateContent',
                [
                    'systemInstruction' => ['parts' => [['text' => $systemPrompt]]],
                    'contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]],
                    'generationConfig' => ['temperature' => 0.4],
                ],
            ));

        $this->ensureSuccessful($response, 'Gemini');
        $responseContent = $response->json('candidates.0.content.parts.0.text');
        $content = is_string($responseContent) ? trim($responseContent) : '';
        if ($content === '') {
            throw new RuntimeException('Gemini không trả về nội dung phân tích.');
        }

        return $content;
    }

    private function sendWithRetry(callable $send): Response
    {
        for ($attempt = 0; $attempt <= 3; $attempt++) {
            try {
                $response = $send();
            } catch (ConnectionException) {
                if ($attempt === 3) {
                    throw new RuntimeException('Không kết nối được nhà cung cấp AI. Vui lòng kiểm tra kết nối.');
                }
                usleep(1_000_000 * (2 ** $attempt));

                continue;
            }

            if (! in_array($response->status(), [408, 429], true) && $response->status() < 500) {
                return $response;
            }
            if ($attempt === 3) {
                return $response;
            }

            usleep(1_000_000 * (2 ** $attempt));
        }

        throw new RuntimeException('Nhà cung cấp AI không trả về kết quả sau khi thử lại.');
    }

    private function ensureSuccessful(Response $response, string $provider): void
    {
        if (! $response->successful()) {
            if ($response->status() === 503) {
                throw new RuntimeException(
                    "{$provider} đang tạm thời quá tải hoặc không khả dụng (HTTP 503). "
                    .'Hệ thống đã thử lại; vui lòng đợi một lúc rồi kiểm tra lại kết nối.',
                );
            }

            throw new RuntimeException("{$provider} trả về lỗi HTTP {$response->status()}.");
        }
    }
}
