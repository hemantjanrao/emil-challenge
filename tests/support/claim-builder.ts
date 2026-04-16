/**
 * Test-data factory for claim creation payloads.
 *
 * Tests run in parallel across files, so every claim gets a unique
 * policyNumber by default — this keeps list/filter assertions
 * deterministic without requiring a shared database reset.
 */

import { randomUUID } from 'node:crypto';
import type { CreateClaimRequest } from './types.js';

let counter = 0;

function uniquePolicyNumber(): string {
  // POL- followed by 10 digits — matches the `^POL-[0-9]{4,10}$` pattern.
  counter += 1;
  const suffix = String(Date.now()).slice(-7) + String(counter).padStart(3, '0');
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
