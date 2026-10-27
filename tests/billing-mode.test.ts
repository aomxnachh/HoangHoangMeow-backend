import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it.each([
  ['production', '', '', true],
  ['development', '', '', true],
  ['production', 'true', '', true],
  ['production', 'false', '', false],
  ['production', '', 'https://payments.example.test/checkout', false],
  ['production', 'true', 'https://payments.example.test/checkout', true],
  ['development', '', 'https://payments.example.test/checkout', false],
] as const)('billing demo mode with environment=%s flag=%s provider=%s', async (environment, flag, provider, expected) => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', environment);
  vi.stubEnv('AUTH_SECRET', 'test-only-auth-secret-for-production-config-check');
  vi.stubEnv('PAYMENT_DEMO_ENABLED', flag);
  vi.stubEnv('PAYMENT_CHECKOUT_URL', provider);
  const config = await import('../src/config.js');
  expect(config.PAYMENT_DEMO_ENABLED).toBe(expected);
});
