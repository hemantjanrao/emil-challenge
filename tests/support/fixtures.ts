/**
 * tests/support/fixtures.ts — Playwright fixture wiring and schema assertion helper.
 *
 * WHAT ARE PLAYWRIGHT FIXTURES?
 * ─────────────────────────────
 * Playwright's fixture system is like dependency injection for tests.
 * Instead of writing `const client = new ClaimsClient(request)` inside every
 * test, you declare that the test needs a `claims` fixture and Playwright
 * creates it automatically before the test runs, then tears it down after.
 *
 * `test.extend<Fixtures>({...})` adds new fixture definitions on top of the
 * built-in `test` object. The built-in `request` fixture is Playwright's
 * HTTP client (APIRequestContext), which this file wraps in our typed client.
 *
 * RESULT: spec files just write `async ({ claims }) => { ... }` and they
 * automatically get a fully configured ClaimsClient pointing at the right server.
 *
 * WHAT IS expectSchema?
 * ─────────────────────
 * A thin wrapper around AJV's validator functions that throws a descriptive
 * error if the response body doesn't match the expected schema. This is used
 * instead of ad-hoc field assertions when we want to check the *entire shape*
 * of a response (all required fields, correct types, format compliance, etc.).
 */

import { test as base, expect } from '@playwright/test';
import { ClaimsClient } from './claims-client.js';
import { validators, formatErrors } from './schema.js';
import type { ValidateFunction } from 'ajv';

/**
 * The set of custom fixtures we add to Playwright's built-in test object.
 * Each key here becomes a parameter name that test functions can destructure.
 */
type Fixtures = {
  /** A pre-configured typed client pointing at the mock server's base URL. */
  claims: ClaimsClient;
};

/**
 * Our extended `test` function — drop-in replacement for Playwright's base `test`.
 *
 * How it works:
 *   base.extend() registers a setup function for each fixture. When a test
 *   uses `{ claims }`, Playwright calls the setup function, which:
 *     1. Creates a new ClaimsClient wrapping the built-in `request` context.
 *     2. Passes it to the test via `use(...)`.
 *     3. After the test finishes, execution resumes after `await use(...)`.
 *        (Nothing to tear down here, but that's the pattern for cleanup.)
 */
export const test = base.extend<Fixtures>({
  claims: async ({ request }, use) => {
    // `request` is Playwright's APIRequestContext — it picks up baseURL and
    // default headers (accept, content-type) from playwright.config.ts.
    await use(new ClaimsClient(request));
  },
});

/**
 * Assert that `value` validates against the given AJV-compiled schema.
 *
 * Why not just call `validator(value)` inline in specs?
 * Because if validation fails, AJV stores raw error objects on `validator.errors`.
 * This helper converts those into a readable message, dumps the offending value,
 * and throws — so the test failure tells you *what* was wrong and *what we got*.
 *
 * Usage:
 *   expectSchema(validators.Claim, await res.json());
 *   // If the body is missing `status`, the thrown error says:
 *   // "Response did not match schema:
 *   //    - /status: must have required property 'status'
 *   //  Got: { id: '...', policyNumber: '...' }"
 */
export function expectSchema(
  validator: ValidateFunction,
  value: unknown,
): void {
  const ok = validator(value);
  if (!ok) {
    throw new Error(
      `Response did not match schema:\n${formatErrors(validator)}\n\nGot:\n${JSON.stringify(
        value,
        null,
        2,
      )}`,
    );
  }
}

// Re-export so spec files only need one import line:
//   import { test, expect, expectSchema, validators } from '../support/fixtures.js';
export { expect, validators };
