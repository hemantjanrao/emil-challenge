/**
 * tests/specs/get-claim.spec.ts — GET /claims/{id}
 *
 * Tests for fetching a single claim by its UUID.
 *
 * Covers:
 *   TC-G1 — happy path: existing id returns 200 + schema-valid body
 *   TC-G2 — valid UUID format but unknown id → 404 CLAIM_NOT_FOUND
 *   TC-G3 — non-UUID path segment → 400 INVALID_ID
 *
 * NOTE on TC-G2 vs TC-G3:
 *   400 and 404 are intentionally different here.
 *   The server validates the id format BEFORE hitting storage (400 = bad input).
 *   Only a correctly-shaped UUID that doesn't exist in the store returns 404.
 *   This design prevents UUID-format probing from leaking "does this exist?" info.
 */

import { test, expect, expectSchema, validators } from '../support/fixtures.js';
import { aValidCreateClaim } from '../support/claim-builder.js';

test.describe('GET /claims/{id}', () => {
  test('TC-G1 returns 200 and a schema-valid Claim for an existing id', async ({ claims }) => {
    // Arrange: create a claim so we have a real id to fetch.
    const created = await claims.createOrThrow(aValidCreateClaim());

    // Act: fetch it back.
    const res = await claims.get(created.id);

    // Assert: 200 and the body matches the Claim schema.
    expect(res.status()).toBe(200);
    expectSchema(validators.Claim, await res.json());
  });

  test('TC-G2 returns 404 for an unknown id', async ({ claims }) => {
    // A valid v4 UUID that was never created — server should return 404.
    const res = await claims.get('11111111-2222-4333-8444-555555555555');
    expect(res.status()).toBe(404);
    expect((await res.json()).code).toBe('CLAIM_NOT_FOUND');
  });

  test('TC-G3 returns 400 for a non-UUID path segment', async ({ claims }) => {
    // The server validates the format first; malformed ids never reach storage.
    const res = await claims.get('not-a-uuid');
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('INVALID_ID');
  });
});
