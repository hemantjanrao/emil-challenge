/**
 * playwright.config.ts — Playwright test runner configuration.
 *
 * Playwright is used here in PURE API mode — no browsers are launched.
 * It acts as a fast, parallel HTTP test runner with built-in fixtures,
 * retries, tracing, and HTML reports.
 *
 * KEY DECISIONS
 * ─────────────
 * webServer block:
 *   Playwright starts the TypeScript mock server automatically before the test
 *   suite runs, and kills it when the suite finishes. This means `npm test`
 *   is a single command — no manual server startup needed.
 *   Set BASE_URL to point at a real server to skip the mock entirely.
 *
 * reuseExistingServer: false:
 *   Forces Playwright to start a fresh mock on every run. Without this,
 *   leftover state from a previous run could bleed into the new test suite.
 *
 * fullyParallel: true:
 *   Spec files run in parallel across multiple OS-level worker processes.
 *   The claim-builder generates worker-unique policyNumbers to keep tests
 *   isolated without needing a shared reset endpoint.
 *
 * trace: 'retain-on-failure':
 *   Playwright captures an HTTP trace for any failing test. The trace zip
 *   can be opened with `npx playwright show-trace` for post-mortem debugging.
 */

import { defineConfig } from '@playwright/test';

// Allow overriding the mock port via environment variable to avoid port conflicts
// when running multiple test suites in the same CI environment.
const mockPort = Number(process.env['MOCK_PORT'] ?? 3100);
const mockBaseUrl = `http://localhost:${mockPort}`;

export default defineConfig({
  // Where Playwright looks for spec files (any *.spec.ts inside this directory).
  testDir: './tests/specs',

  // Run all spec files simultaneously (each in its own worker process).
  fullyParallel: true,

  // In CI, fail immediately if a test file contains `.only` — prevents accidental
  // partial runs from being merged when a developer forgot to remove `.only`.
  forbidOnly: !!process.env['CI'],

  // In CI, retry each failed test once. Useful for the occasional timing flake;
  // a test that fails twice is almost certainly a real bug.
  retries: process.env['CI'] ? 1 : 0,

  // In CI, cap at 2 workers to avoid saturating a shared runner.
  // Locally, Playwright picks the number automatically based on CPU count.
  workers: process.env['CI'] ? 2 : undefined,

  // CI: add the GitHub Actions reporter (annotations in PR checks) + HTML report.
  // Local: just list + HTML (no GitHub reporter — it writes noisy output outside CI).
  reporter: process.env['CI']
    ? [['list'], ['html', { open: 'never' }], ['github']]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    // All `request.get('/claims')` calls resolve relative to this base URL.
    baseURL: process.env['BASE_URL'] ?? mockBaseUrl,

    // Default headers sent with every HTTP request — the API is JSON-only.
    extraHTTPHeaders: {
      accept: 'application/json',
      'content-type': 'application/json',
    },

    // Save HTTP traces to disk for any test that fails. Traces can be viewed
    // interactively: npx playwright show-trace playwright-report/trace.zip
    trace: 'retain-on-failure',
  },

  // If BASE_URL is set, the user is pointing at an already-running server —
  // skip the webServer block entirely (no mock needed).
  webServer: process.env['BASE_URL']
    ? undefined
    : {
        // `tsx` runs TypeScript directly — no compile step, no dist/ directory.
        // PORT env var is forwarded so the mock binds to our chosen port.
        command: `PORT=${mockPort} npx tsx src/mock-server.ts`,

        // Playwright polls this URL after starting the server process.
        // It waits until the URL returns any HTTP response before running tests.
        url: `${mockBaseUrl}/claims`,

        // Always start fresh — do not reuse a server left over from a previous run.
        reuseExistingServer: false,

        // Suppress mock server stdout/stderr during test runs to keep output clean.
        // Set LOG_REQUESTS=true in the command above to debug requests instead.
        stdout: 'ignore',
        stderr: 'ignore',

        // Maximum time to wait for the server to be ready.
        timeout: 15_000,
      },
});
