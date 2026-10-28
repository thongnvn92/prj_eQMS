import { describe, expect, it } from 'vitest';
import { AI_PROVIDER_META, DEFAULT_AI_SETTINGS, isAiConfigured } from './ai';

describe('AI settings', () => {
  it('offers OpenAI and Gemini and defaults to a disabled Gemini integration', () => {
    expect(Object.keys(AI_PROVIDER_META)).toEqual(['openai', 'gemini']);
    expect(DEFAULT_AI_SETTINGS).toEqual({
      provider: 'gemini',
      apiKey: '',
      apiKeyConfigured: false,
      model: 'gemini-3.8-flash',
      enabled: false,
    });
  });

  it('requires an enabled integration, a configured key, and a model', () => {
    expect(isAiConfigured({
      ...DEFAULT_AI_SETTINGS,
      apiKeyConfigured: true,
      enabled: true,
    })).toBe(true);
    expect(isAiConfigured({ ...DEFAULT_AI_SETTINGS, enabled: true })).toBe(false);
    expect(isAiConfigured({
      ...DEFAULT_AI_SETTINGS,
      apiKeyConfigured: true,
      enabled: true,
      model: ' ',
    })).toBe(false);
  });
});
