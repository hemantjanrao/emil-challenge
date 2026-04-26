/**
 * tests/support/claim-builder.ts — test-data factory for claim creation payloads.
 *
 * WHY A FACTORY FUNCTION?
 * ───────────────────────
 * Every test that creates a claim needs a valid request body. Without a factory:
 *   - Every spec file would duplicate the same object literal.
 *   - If the schema changes (e.g. a new required field), every test breaks.
 *   - There's no easy way to vary just one field while keeping the rest valid.
 *
 * `aValidCreateClaim()` solves this:
 *   - No args needed for happy-path tests.
 *   - Pass `overrides` to change specific fields (negative/edge-case tests).
 *   - The factory generates a unique policyNumber automatically.
 *
 * PARALLELISM AND UNIQUE policyNumbers
 * ─────────────────────────────────────
 * Playwright runs test files concurrently in separate worker processes.
 * The shared in-memory mock server receives requests from ALL workers at once.
 * Some tests filter the claim list by policyNumber and assert exactly N results.
 * If two workers use the same policyNumber, those assertions become flaky.
 *
 * Solution: encode the worker's OS process ID into every policyNumber.
 *   workerPrefix  = last 5 digits of process.pid   (different per worker)
 *   localSequence = counter incremented per call   (different per test within a worker)
 *   result        = POL-<workerPrefix><localSequence>  e.g. POL-4521700001
 *
 * This gives up to 100,000 unique policyNumbers per worker, with no shared state.
 */

import { randomUUID } from 'node:crypto';
import type { CreateClaimRequest } from './types.js';

/** Monotonically increasing counter, local to this module instance (one per worker). */
let counter = 0;

/**
 * Generates a policyNumber that is unique across parallel Playwright workers.
 *
 * Format: POL-WWWWWLLLLL
 *   WWWWW = last 5 digits of process.pid  (worker identifier)
 *   LLLLL = 5-digit local sequence number  (per-call counter within this worker)
 *
 * Total length = 10 digits → matches the spec pattern ^POL-[0-9]{4,10}$.
 */
function uniquePolicyNumber(): string {
  counter += 1;
  // process.pid is the OS process ID of the Node.js worker (each Playwright worker
  // is a separate process). `% 100_000` caps it to 5 digits; padStart pads shorter ones.
  const workerPrefix  = String(process.pid % 100_000).padStart(5, '0');
  const localSequence = String(counter    % 100_000).padStart(5, '0');
  return `POL-${workerPrefix}${localSequence}`;
}

/**
 * Returns a fully valid CreateClaimRequest, with overrides applied on top.
 *
 * Usage:
 *   // Happy path — all fields valid, unique policyNumber:
 *   const payload = aValidCreateClaim();
 *
 *   // Negative test — force an invalid field while keeping everything else valid:
 *   const payload = aValidCreateClaim({ damageDate: 'not-a-date' });
 *
 *   // Share a policyNumber across multiple claims in one test (TC-L3):
 *   const shared = aValidCreateClaim().policyNumber;
 *   const c1 = aValidCreateClaim({ policyNumber: shared });
 *   const c2 = aValidCreateClaim({ policyNumber: shared });
 */
export function aValidCreateClaim(
  overrides: Partial<CreateClaimRequest> = {},
): CreateClaimRequest {
  return {
    policyNumber:    uniquePolicyNumber(),
    // randomUUID prefix keeps claimant names unique without a counter
    claimantName:    `Claimant ${randomUUID().slice(0, 8)}`,
    // A past date — passes the "not in the future" business rule
    damageDate:      '2026-03-01',
    // Meets the minLength: 10 constraint from the OpenAPI spec
    lossDescription: 'Front bumper damaged after parking collision in an underground garage.',
    // Spread last so callers can override any of the above fields
    ...overrides,
  };
}
