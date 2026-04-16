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
  console.log(`EMIL Claims mock listening on http://localhost:${PORT}`);
});
