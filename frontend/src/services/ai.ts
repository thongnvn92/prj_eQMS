// ============================================================
// AI Insight – phân tích/thống kê/báo cáo nhanh Dashboard bằng
// Gemini / OpenAI(GPT) / Claude. API key do admin cấu hình ở
// trang Quản trị (localStorage) — xem components/AdminPage.tsx.
//
// LƯU Ý BẢO MẬT: gọi trực tiếp provider từ trình duyệt (phù hợp
// nội bộ/demo). Với production nên proxy qua backend để không lộ key.
// ============================================================

export type AiProvider = 'openai' | 'gemini' | 'claude';

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  enabled: boolean;
}

const STORAGE_KEY = 'eqms.ai.settings';

export const AI_PROVIDER_META: Record<AiProvider, { label: string; defaultModel: string; docs: string }> = {
  openai: { label: 'OpenAI (GPT)', defaultModel: 'gpt-4o-mini', docs: 'https://platform.openai.com/api-keys' },
  gemini: { label: 'Google Gemini', defaultModel: 'gemini-1.5-flash', docs: 'https://aistudio.google.com/app/apikey' },
  claude: { label: 'Anthropic Claude', defaultModel: 'claude-3-5-sonnet-20241022', docs: 'https://console.anthropic.com/settings/keys' },
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
    return {
      provider: (parsed.provider ?? DEFAULT_AI_SETTINGS.provider) as AiProvider,
      apiKey: parsed.apiKey ?? '',
      model: parsed.model ?? AI_PROVIDER_META[(parsed.provider as AiProvider) ?? 'gemini'].defaultModel,
      enabled: !!parsed.enabled,
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
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sys }] },
            contents: [{ role: 'user', parts: [{ text: dataPrompt }] }],
            generationConfig: { temperature: 0.4 },
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini lỗi ${res.status}: ${await safeText(res)}`);
      const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '(AI không trả về nội dung)';
    }

    // claude
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 2000,
        system: sys,
        messages: [{ role: 'user', content: dataPrompt }],
      }),
    });
    if (!res.ok) throw new Error(`Claude lỗi ${res.status}: ${await safeText(res)}`);
    const json = (await res.json()) as { content?: { text?: string }[] };
    return json.content?.[0]?.text?.trim() || '(AI không trả về nội dung)';
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
