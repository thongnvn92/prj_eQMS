import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// DMC eQMS frontend – Vite config
// Backend API không hardcode trong source: cấu hình qua `.env` (xem .env.example).
// - Cách 1 (khuyên dùng): set VITE_API_URL (origin Laravel) => fetch gọi trực tiếp.
// - Cách 2: để VITE_API_URL trống và dùng dev proxy '/api' -> VITE_PROXY_TARGET.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET?.trim();

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: proxyTarget
        ? {
            '/api': {
              target: proxyTarget,
              changeOrigin: true,
            },
          }
        : undefined,
    },
  };
});
