/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin của Laravel API (bỏ trống nếu đi qua Vite proxy '/api'). */
  readonly VITE_API_URL?: string;
  /** 'true' = dùng mock API; mặc định gọi API Laravel thật. */
  readonly VITE_USE_MOCK?: string;
  /** Target dev-only cho Vite proxy '/api'. */
  readonly VITE_PROXY_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

