export type AiProvider = 'openai' | 'gemini';

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  apiKeyConfigured: boolean;
  model: string;
  enabled: boolean;
}

export const AI_PROVIDER_META: Record<AiProvider, { label: string; defaultModel: string; docs: string }> = {
  openai: { label: 'OpenAI (GPT)', defaultModel: 'gpt-4o-mini', docs: 'https://platform.openai.com/api-keys' },
  gemini: { label: 'Google Gemini', defaultModel: 'gemini-3.8-flash', docs: 'https://aistudio.google.com/app/apikey' },
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'gemini',
  apiKey: '',
  apiKeyConfigured: false,
  model: AI_PROVIDER_META.gemini.defaultModel,
  enabled: false,
};

export function isAiConfigured(settings: AiSettings): boolean {
  return settings.enabled && settings.apiKeyConfigured && settings.model.trim().length > 0;
}
