<?php

namespace App\Services;

use App\Models\Setting;

class AiSettingsService
{
    private const SETTING_KEY = 'ai';

    private const MASKED_API_KEY = '******';

    private const DEFAULTS = [
        'provider' => 'gemini',
        'model' => 'gemini-3.8-flash',
        'enabled' => false,
        'apiKey' => '',
    ];

    public function stored(): array
    {
        $setting = Setting::query()->where('key', self::SETTING_KEY)->first();

        return array_replace(self::DEFAULTS, $setting?->value ?? []);
    }

    public function response(): array
    {
        $settings = $this->stored();
        $hasApiKey = trim($settings['apiKey']) !== '';

        return [
            'provider' => $settings['provider'],
            'model' => $settings['model'],
            'enabled' => $settings['enabled'],
            'apiKey' => $hasApiKey ? self::MASKED_API_KEY : '',
            'apiKeyConfigured' => $hasApiKey,
        ];
    }

    public function update(array $input): array
    {
        $current = $this->stored();
        $providerChanged = $input['provider'] !== $current['provider'];
        $providedKey = trim($input['apiKey'] ?? '');
        $apiKey = $providedKey !== '' && $providedKey !== self::MASKED_API_KEY
            ? $providedKey
            : ($providerChanged ? '' : $current['apiKey']);

        $settings = [
            'provider' => $input['provider'],
            'model' => trim($input['model']) ?: self::DEFAULTS['model'],
            'enabled' => $input['enabled'],
            'apiKey' => $apiKey,
        ];

        Setting::query()->updateOrCreate(
            ['key' => self::SETTING_KEY],
            ['value' => $settings],
        );

        return $this->response();
    }
}
