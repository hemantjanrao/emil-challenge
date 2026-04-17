/**
 * Entry point — only calls `app.listen()`.
 *
 * Keeping the Express app separate from the entry point means the app
 * can be imported by Playwright's webServer (which calls this file) and
 * also imported directly in unit tests without starting a real server.
 */

import { app } from './claims-mock-app.js';

const PORT = Number(process.env['PORT'] ?? 3000);

app.listen(PORT, () => {
  const baseUrl = `http://localhost:${PORT}`;
  const requestLogs = process.env['LOG_REQUESTS'] === 'true' ? 'enabled' : 'disabled';

  console.log(`
EMIL Claims mock server
-----------------------
Base URL      ${baseUrl}
API root      ${baseUrl}/claims
Request logs  ${requestLogs} (set LOG_REQUESTS=true to enable)
`);
});
