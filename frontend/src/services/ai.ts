// ============================================================
// AI Insight – phân tích/thống kê/báo cáo nhanh Dashboard bằng
// Gemini / OpenAI(GPT). API key do admin cấu hình ở
// trang Quản trị (localStorage) — xem pages/AdminPage.tsx.
//
// LƯU Ý BẢO MẬT: gọi trực tiếp provider từ trình duyệt (phù hợp
// nội bộ/demo). Với production nên proxy qua backend để không lộ key.
// ============================================================

export type AiProvider = 'openai' | 'gemini';

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  enabled: boolean;
}

const STORAGE_KEY = 'eqms.ai.settings';

export const AI_PROVIDER_META: Record<AiProvider, { label: string; defaultModel: string; docs: string }> = {
  openai: { label: 'OpenAI (GPT)', defaultModel: 'gpt-4o-mini', docs: 'https://platform.openai.com/api-keys' },
  gemini: { label: 'Google Gemini', defaultModel: 'gemini-3.8-flash', docs: 'https://aistudio.google.com/app/apikey' },
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  provider: 'gemini',
  apiKey: '',
  model: AI_PROVIDER_META.gemini.defaultModel,
  enabled: false,
};

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    const storedProvider = parsed.provider;
    const provider: AiProvider = storedProvider === 'openai' || storedProvider === 'gemini'
      ? storedProvider
      : DEFAULT_AI_SETTINGS.provider;
    const savedModel = parsed.model?.trim();
    return {
      provider,
      apiKey: storedProvider && storedProvider !== provider ? '' : parsed.apiKey ?? '',
      model: storedProvider && storedProvider !== provider
        ? AI_PROVIDER_META[provider].defaultModel
        : provider === 'gemini' && savedModel === 'gemini-1.5-flash'
          ? AI_PROVIDER_META.gemini.defaultModel
          : savedModel || AI_PROVIDER_META[provider].defaultModel,
      enabled: storedProvider && storedProvider !== provider ? false : !!parsed.enabled,
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function isAiConfigured(s: AiSettings): boolean {
  return s.enabled && s.apiKey.trim().length > 0 && s.model.trim().length > 0;
}

const SYSTEM_PROMPT =
  'Bạn là trợ lý phân tích quản trị cho Ban ISO (hệ thống eQMS). ' +
  'Phân tích dữ liệu KPI/tài liệu/công việc được cung cấp và trả lời TIẾNG VIỆT, súc tích, ' +
  'theo cấu trúc: (1) Đánh giá tổng quan, (2) Rủi ro & tồn đọng cần chú ý, (3) Đề xuất hành động ưu tiên tuần tới. ' +
  'Dùng gạch đầu dòng, số liệu cụ thể, không đoán dữ liệu không có.';

const GEMINI_MAX_RETRIES = 3;
const GEMINI_RETRY_BASE_DELAY_MS = 1_000;
const GEMINI_RETRY_MAX_DELAY_MS = 30_000;
const OPENAI_MAX_RETRIES = 3;
const OPENAI_RETRY_BASE_DELAY_MS = 1_000;
const OPENAI_RETRY_MAX_DELAY_MS = 30_000;

interface ProviderError {
  code?: string;
  message?: string;
  type?: string;
}

function parseProviderError(body: string): ProviderError | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || !('error' in parsed)) return undefined;
    const error = parsed.error;
    if (typeof error !== 'object' || error === null) return undefined;

    return {
      code: 'code' in error && typeof error.code === 'string' ? error.code : undefined,
      message: 'message' in error && typeof error.message === 'string' ? error.message : undefined,
      type: 'type' in error && typeof error.type === 'string' ? error.type : undefined,
    };
  } catch {
    return undefined;
  }
}

function isRetryableOpenAiResponse(status: number, error?: ProviderError): boolean {
  if (status === 408 || (status >= 500 && status <= 599)) return true;
  return status === 429 && (error?.code === 'rate_limit_exceeded' || error?.code === 'slow_down');
}

function isOpenAiQuotaError(code?: string): boolean {
  return code === 'insufficient_quota'
    || code === 'project_spend_limit_exceeded'
    || code === 'organization_spend_limit_exceeded'
    || code === 'organization_usage_limit_reached'
    || code === 'organization_usage_limit_exceeded'
    || code === 'billing_not_active'
    || code === 'credit_balance_exhausted';
}

function isRetryableGeminiStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get('Retry-After');
  if (!value) return undefined;

  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) && delay > 0
    ? Math.min(delay, GEMINI_RETRY_MAX_DELAY_MS)
    : undefined;
}

function geminiRetryDelay(attempt: number, response: Response): number {
  const retryAfter = retryAfterMs(response);
  if (retryAfter !== undefined) return retryAfter;

  const exponentialDelay = Math.min(
    GEMINI_RETRY_BASE_DELAY_MS * 2 ** attempt,
    GEMINI_RETRY_MAX_DELAY_MS,
  );
  return exponentialDelay + Math.random() * Math.min(exponentialDelay * 0.25, 1_000);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOpenAiWithRetry(url: string, request: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= OPENAI_MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, request);
    if (response.ok) return response;

    const responseBody = await safeText(response);
    const providerError = parseProviderError(responseBody);
    const retryable = isRetryableOpenAiResponse(response.status, providerError);
    if (!retryable || attempt === OPENAI_MAX_RETRIES) {
      const quotaMessage = isOpenAiQuotaError(providerError?.code)
        ? ' Kiểm tra billing, credits hoặc giới hạn chi tiêu của OpenAI; lỗi này không thể khắc phục bằng cách thử lại.'
        : '';
      const retryMessage = retryable
        ? ' (đã thử lại 3 lần; vui lòng thử lại sau)'
        : '';
      throw new Error(`OpenAI lỗi ${response.status}: ${responseBody}${retryMessage}${quotaMessage}`);
    }

    const retryAfter = retryAfterMs(response);
    const exponentialDelay = Math.min(
      OPENAI_RETRY_BASE_DELAY_MS * 2 ** attempt,
      OPENAI_RETRY_MAX_DELAY_MS,
    );
    const jitteredDelay = exponentialDelay + Math.random() * Math.min(exponentialDelay * 0.25, 1_000);
    await delay(retryAfter ?? jitteredDelay);
  }

  throw new Error('OpenAI không trả về kết quả sau khi thử lại.');
}

/**
 * Gọi provider và trả về nội dung text phân tích. Ném Error với message thân thiện nếu lỗi.
 * @param systemPrompt hệ thống/persona tuỳ chọn (RAG truyền persona chuyên gia ISO).
 */
export async function analyzeWithAi(settings: AiSettings, dataPrompt: string, systemPrompt?: string): Promise<string> {
  const { provider, apiKey, model } = settings;
  const key = apiKey.trim();
  if (!key) throw new Error('Chưa cấu hình API key. Vui lòng nhập key ở trang Quản trị.');
  if (!model.trim()) throw new Error('Chưa chọn model AI.');
  const sys = systemPrompt && systemPrompt.trim() ? systemPrompt : SYSTEM_PROMPT;

  try {
    if (provider === 'openai') {
      const res = await fetchOpenAiWithRetry('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: dataPrompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI lỗi ${res.status}: ${await safeText(res)}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content?.trim() || '(AI không trả về nội dung)';
    }

    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      const request = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sys }] },
          contents: [{ role: 'user', parts: [{ text: dataPrompt }] }],
          generationConfig: { temperature: 0.4 },
        }),
      };

      for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
        const res = await fetch(url, request);
        if (res.ok) {
          const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
          return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '(AI không trả về nội dung)';
        }

        if (!isRetryableGeminiStatus(res.status) || attempt === GEMINI_MAX_RETRIES) {
          const details = await safeText(res);
          const retryMessage = isRetryableGeminiStatus(res.status)
            ? ' (đã thử lại 3 lần; vui lòng thử lại sau)'
            : '';
          throw new Error(`Gemini lỗi ${res.status}: ${details}${retryMessage}`);
        }

        await delay(geminiRetryDelay(attempt, res));
      }

      throw new Error('Gemini không trả về kết quả sau khi thử lại.');
    }

    throw new Error('Nhà cung cấp AI không được hỗ trợ.');
  } catch (e) {
    // Lỗi mạng (fetch throw) → thông báo chung.
    if (e instanceof TypeError) throw new Error('Không gọi được AI (kiểm tra mạng/CORS hoặc API key).');
    throw e;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 300);
  } catch {
    return '';
  }
}
