import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  outputDir: '../../generated-artifacts/browser-results',
  use: {
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:80',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
