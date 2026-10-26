<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AiAnalysis;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AiAnalysisController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $analyses = AiAnalysis::query()
            ->where('user_id', $request->user()->id)
            ->orderByDesc('analyzed_at')
            ->orderByDesc('id')
            ->limit(10)
            ->get()
            ->map(fn (AiAnalysis $analysis) => $this->toResponse($analysis));

        return response()->json($analyses);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mode' => ['required', 'string', 'max:40'],
            'provider' => ['required', 'in:openai,gemini'],
            'model' => ['required', 'string', 'max:120'],
            'content' => ['required', 'string', 'max:16000'],
        ]);

        $analysis = AiAnalysis::create([
            ...$validated,
            'user_id' => $request->user()->id,
            'analyzed_at' => now(),
        ]);

        return response()->json($this->toResponse($analysis), 201);
    }

    private function toResponse(AiAnalysis $analysis): array
    {
        return [
            'id' => $analysis->id,
            'mode' => $analysis->mode,
            'provider' => $analysis->provider,
            'model' => $analysis->model,
            'content' => $analysis->content,
            'analyzedAt' => $analysis->analyzed_at->toIso8601String(),
        ];
    }
}
