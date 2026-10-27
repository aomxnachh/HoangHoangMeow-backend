import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['e2e/**/*.test.ts'], testTimeout: 45000, hookTimeout: 90000, fileParallelism: false, env: { CLIENT_ORIGIN: 'http://127.0.0.1:5174' } } });
