/**
 * tests/support/schema.ts — thin test-side wrapper around lib/openapi.ts.
 *
 * WHY NOT IMPORT LIB DIRECTLY IN SPECS?
 * ──────────────────────────────────────
 * Spec files use short relative imports like `../support/schema.js`.
 * If we later move the validators or change the library, only this file
 * needs updating — spec files stay untouched.
 *
 * WHAT IS EXPORTED?
 *   validators  — pre-compiled AJV validator functions (Claim, ClaimsList, Error)
 *   spec        — the raw parsed OpenAPI object (rarely needed in tests)
 *   formatErrors — turns AJV error objects into a human-readable string
 */

import type { ValidateFunction } from 'ajv';

// Re-export everything from the shared library so specs can do:
//   import { validators } from '../support/schema.js'
export { validators, spec } from '../../lib/openapi.js';

/**
 * Converts AJV's raw error array into a readable bullet list.
 *
 * AJV stores errors on `fn.errors` after a failed validation call.
 * Each error has:
 *   - instancePath  where in the object the problem is (e.g. "/status")
 *   - message       what went wrong   (e.g. "must be equal to one of the allowed values")
 *
 * Example output:
 *   - /status must be equal to one of the allowed values
 *   - /policyNumber must match pattern "^POL-[0-9]{4,10}$"
 */
export function formatErrors(fn: ValidateFunction): string {
  return (fn.errors ?? [])
    .map((e) => `  - ${e.instancePath || '(root)'} ${e.message ?? 'invalid'}`)
    .join('\n');
}
