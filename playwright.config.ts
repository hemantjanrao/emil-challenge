import { defineConfig } from '@playwright/test';

const mockPort = Number(process.env['MOCK_PORT'] ?? 3100);
const mockBaseUrl = `http://localhost:${mockPort}`;

/**
 * Playwright is used in API-only mode — no browsers launched.
 * `webServer` starts the TypeScript mock via `tsx` before the suite runs.
 * Set BASE_URL to point at a real service (skips the webServer block).
 */
export default defineConfig({
  testDir: './tests/specs',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: process.env['CI'] ? 2 : undefined,
  reporter: process.env['CI']
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env['BASE_URL'] ?? mockBaseUrl,
    extraHTTPHeaders: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    trace: 'retain-on-failure',
  },
  webServer: process.env['BASE_URL']
    ? undefined
    : {
        command: `PORT=${mockPort} npx tsx src/mock-server.ts`,
        url: `${mockBaseUrl}/claims`,
        reuseExistingServer: false,
        stdout: 'ignore',
        stderr: 'ignore',
        timeout: 15_000,
      },
});
