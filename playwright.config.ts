import { defineConfig } from '@playwright/test';

/**
 * Playwright is used in API-only mode — no browsers are launched. The
 * `webServer` block starts our Express mock before the suite runs and
 * tears it down after.
 */
export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    trace: 'retain-on-failure',
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'node mock-server.js',
        url: 'http://localhost:3000/claims',
        reuseExistingServer: !process.env.CI,
        stdout: 'pipe',
        stderr: 'pipe',
        timeout: 10_000,
      },
});
