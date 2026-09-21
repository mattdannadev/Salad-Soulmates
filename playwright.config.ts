import { defineConfig, devices } from '@playwright/test';

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const localLaunch = chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {};

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  // The browser suites share one mutable, disposable database fixture.
  workers: 1,
  forbidOnly: true,
  retries: 0,
  use: { baseURL: 'http://127.0.0.1:3000', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: localLaunch,
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'phone',
      use: {
        ...devices['iPhone 13'],
        defaultBrowserType: 'chromium',
        launchOptions: localLaunch,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: [
    {
      command: 'node tests/browser/auth-service.mjs',
      url: 'http://127.0.0.1:4010/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:3000/login',
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4010',
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-test-publishable-key',
        SUPABASE_SECRET_KEY: '',
      },
    },
  ],
});
