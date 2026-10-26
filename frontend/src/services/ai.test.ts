import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDER_META, DEFAULT_AI_SETTINGS, analyzeWithAi, loadAiSettings } from './ai';

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function geminiResponse(status: number, body: Record<string, unknown>, text = ''): Response {
  return new Response(text || JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Gemini integration', () => {
  it('offers only OpenAI GPT and Gemini providers and migrates legacy Claude settings safely', () => {
    expect(Object.keys(AI_PROVIDER_META)).toEqual(['openai', 'gemini']);

    localStorage.setItem('eqms.ai.settings', JSON.stringify({
      provider: 'claude',
      apiKey: 'legacy-key',
      model: 'claude-3-5-sonnet-20241022',
      enabled: true,
    }));

    expect(loadAiSettings()).toEqual({
      provider: 'gemini',
      apiKey: '',
      model: AI_PROVIDER_META.gemini.defaultModel,
      enabled: false,
    });
  });

  it('uses the supported Flash model and migrates the retired saved default', () => {
    expect(DEFAULT_AI_SETTINGS.model).toBe(AI_PROVIDER_META.gemini.defaultModel);
    expect(AI_PROVIDER_META.gemini.defaultModel).toBe('gemini-3.8-flash');

    localStorage.setItem('eqms.ai.settings', JSON.stringify({
      provider: 'gemini',
      apiKey: 'test-key',
      model: 'gemini-1.5-flash',
      enabled: true,
    }));

    expect(loadAiSettings().model).toBe('gemini-3.8-flash');
  });

  it('sends generateContent requests with the API key header, not in the URL', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Kết nối AI thành công' }] } }] }),
    } as Response);

    const result = await analyzeWithAi(
      { provider: 'gemini', apiKey: 'test-key', model: 'gemini-3.8-flash', enabled: true },
      'Kiểm tra kết nối',
    );

    expect(result).toBe('Kết nối AI thành công');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'test-key' },
      }),
    );
    expect(fetchMock.mock.calls[0][0]).not.toContain('test-key');
  });

  it('supports OpenAI GPT chat completions', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Kết nối GPT thành công' } }] }),
    } as Response);

    const result = await analyzeWithAi(
      { provider: 'openai', apiKey: 'test-key', model: 'gpt-4o-mini', enabled: true },
      'Kiểm tra kết nối',
    );

    expect(result).toBe('Kết nối GPT thành công');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
      }),
    );
  });

  it('retries transient OpenAI rate limits and succeeds when the limit clears', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    fetchMock
      .mockResolvedValueOnce(geminiResponse(429, {
        error: { message: 'Rate limit reached', type: 'rate_limit_error', code: 'rate_limit_exceeded' },
      }))
      .mockResolvedValueOnce(geminiResponse(200, {
        choices: [{ message: { content: 'Kết nối GPT thành công' } }],
      }));

    const resultPromise = analyzeWithAi(
      { provider: 'openai', apiKey: 'test-key', model: 'gpt-4o-mini', enabled: true },
      'Kiểm tra kết nối',
    );
    const resultAssertion = expect(resultPromise).resolves.toBe('Kết nối GPT thành công');
    await vi.runAllTimersAsync();

    await resultAssertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry OpenAI quota or billing errors and explains what to check', async () => {
    fetchMock.mockResolvedValue(geminiResponse(429, {
      error: {
        message: 'You exceeded your current quota',
        type: 'insufficient_quota',
        code: 'insufficient_quota',
      },
    }));

    await expect(analyzeWithAi(
      { provider: 'openai', apiKey: 'test-key', model: 'gpt-4o-mini', enabled: true },
      'Kiểm tra kết nối',
    )).rejects.toThrow('Kiểm tra billing, credits hoặc giới hạn chi tiêu của OpenAI');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries transient 503 errors with backoff and succeeds when Gemini recovers', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    fetchMock
      .mockResolvedValueOnce(geminiResponse(503, {}, 'Service Unavailable'))
      .mockResolvedValueOnce(geminiResponse(503, {}, 'Service Unavailable'))
      .mockResolvedValueOnce(geminiResponse(200, {
        candidates: [{ content: { parts: [{ text: 'Kết nối AI thành công' }] } }],
      }));

    const resultPromise = analyzeWithAi(
      { provider: 'gemini', apiKey: 'test-key', model: 'gemini-3.8-flash', enabled: true },
      'Kiểm tra kết nối',
    );
    const resultAssertion = expect(resultPromise).resolves.toBe('Kết nối AI thành công');
    await vi.runAllTimersAsync();

    await resultAssertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops after bounded retries and reports a persistent 503 clearly', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    fetchMock.mockResolvedValue(geminiResponse(503, {}, 'Service Unavailable'));

    const resultPromise = analyzeWithAi(
      { provider: 'gemini', apiKey: 'test-key', model: 'gemini-3.8-flash', enabled: true },
      'Kiểm tra kết nối',
    );
    const resultAssertion = expect(resultPromise).rejects.toThrow(
      'Gemini lỗi 503: Service Unavailable (đã thử lại 3 lần; vui lòng thử lại sau)',
    );
    await vi.runAllTimersAsync();

    await resultAssertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('does not retry permanent client errors', async () => {
    fetchMock.mockResolvedValue(geminiResponse(403, {}, 'API key invalid'));

    await expect(analyzeWithAi(
      { provider: 'gemini', apiKey: 'test-key', model: 'gemini-3.8-flash', enabled: true },
      'Kiểm tra kết nối',
    )).rejects.toThrow('Gemini lỗi 403: API key invalid');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
