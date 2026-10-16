import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest config – DMC eQMS (Task 06)
// - Tách khỏi vite.config.ts để không ảnh hưởng dev/build server.
// - Env test cố định: gọi API "thật" (mock off) trỏ tới http://api.test
//   (tests tự mock fetch – không phụ thuộc backend đang chạy).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    env: {
      VITE_API_URL: 'http://api.test',
      VITE_USE_MOCK: 'false',
    },
  },
});
