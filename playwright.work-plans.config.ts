import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: '**/work-plans.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:3012' },
  webServer: [
    {
      command: 'node tests/browser/auth-service.mjs',
      url: 'http://127.0.0.1:4010/health',
      reuseExistingServer: false,
    },
    {
      command: 'npx next dev --hostname 127.0.0.1 --port 3012',
      url: 'http://127.0.0.1:3012/login',
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4010',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-test-publishable-key',
        SUPABASE_SECRET_KEY: 'local-test-secret-key',
      },
    },
  ],
});
