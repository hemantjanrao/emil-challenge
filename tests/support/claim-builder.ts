/**
 * Test-data factory for claim creation payloads.
 *
 * Tests run in parallel across worker processes, so every claim gets a
 * policyNumber derived from process id + local sequence. That keeps
 * list/filter assertions deterministic without requiring a shared reset.
 */

import { randomUUID } from 'node:crypto';
import type { CreateClaimRequest } from './types.js';

let counter = 0;

function uniquePolicyNumber(): string {
  // POL- followed by 10 digits — matches the `^POL-[0-9]{4,10}$` pattern.
  counter += 1;
  const workerPrefix = String(process.pid % 100_000).padStart(5, '0');
  const localSequence = String(counter % 100_000).padStart(5, '0');
  const suffix = workerPrefix + localSequence;
  return `POL-${suffix}`;
}

export function aValidCreateClaim(
  overrides: Partial<CreateClaimRequest> = {},
): CreateClaimRequest {
  return {
    policyNumber: uniquePolicyNumber(),
    claimantName: `Claimant ${randomUUID().slice(0, 8)}`,
    damageDate: '2026-03-01',
    lossDescription:
      'Front bumper damaged after parking collision in an underground garage.',
    ...overrides,
  };
}
