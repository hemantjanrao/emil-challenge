/**
 * tests/specs/list-claims.spec.ts — GET /claims (list + filter)
 *
 * Tests for the list endpoint that returns all claims, optionally filtered.
 *
 * Covers:
 *   TC-L1 — unfiltered list returns 200 and a schema-valid array (may be empty)
 *   TC-L2 — filter by policyNumber returns exactly the seeded claim
 *   TC-L3 — filter by status returns only claims with that status
 *   TC-L4 — filter with no matches returns 200 + [] (never 404)
 *   TC-L5 — unknown status value → 400 INVALID_QUERY_PARAM
 *   TC-L6 — malformed policyNumber → 400 INVALID_QUERY_PARAM
 *
 * PARALLELISM NOTE
 * ────────────────
 * Playwright runs spec files in parallel across multiple workers.
 * Each creates its own claims, so the list could contain claims from other
 * workers. TC-L2 and TC-L3 always filter by a unique policyNumber so
 * assertions stay deterministic regardless of what other tests have written.
 */

import { test, expect, expectSchema, validators } from '../support/fixtures.js';
import { aValidCreateClaim } from '../support/claim-builder.js';
import type { Claim } from '../support/types.js';

test.describe('GET /claims', () => {

  test('TC-L1 returns a schema-valid array (possibly empty)', async ({ claims }) => {
    // No filter — returns everything currently in the mock's in-memory store.
    const res = await claims.list();
    expect(res.status()).toBe(200);
    const body = await res.json();
    // validators.ClaimsList checks that the body is an array where every
    // item matches the Claim schema.
    expectSchema(validators.ClaimsList, body);
  });

  test('TC-L2 filters by policyNumber (exact match)', async ({ claims }) => {
    // Arrange: create a claim with a unique policy number.
    const payload = aValidCreateClaim();
    const created = await claims.createOrThrow(payload);

    // Act: list filtered to that policy number.
    const res = await claims.list({ policyNumber: payload.policyNumber });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as Claim[];
    expectSchema(validators.ClaimsList, body);
    // Exactly one result, and it's the claim we just created.
    expect(body).toHaveLength(1);
    expect(body[0]).toEqual(created);
  });

  test('TC-L3 filters by status — returned rows all have that status', async ({ claims }) => {
    // Arrange: create two claims sharing the same policy number (so we can
    // filter the list to just our test data). Advance one to IN_REVIEW.
    const policy = aValidCreateClaim().policyNumber;
    const openClaim   = await claims.createOrThrow(aValidCreateClaim({ policyNumber: policy }));
    const reviewClaim = await claims.createOrThrow(aValidCreateClaim({ policyNumber: policy }));
    await claims.advanceThrough(reviewClaim.id, [{ status: 'IN_REVIEW' }]);

    // Act + Assert: status=IN_REVIEW filter returns only the reviewed claim.
    const inReview = await claims.list({ policyNumber: policy, status: 'IN_REVIEW' });
    expect(inReview.status()).toBe(200);
    const inReviewBody = (await inReview.json()) as Claim[];
    expect(inReviewBody.map((c) => c.id)).toEqual([reviewClaim.id]);
    expect(inReviewBody.every((c) => c.status === 'IN_REVIEW')).toBe(true);

    // And status=OPEN returns only the un-advanced claim.
    const open = await claims.list({ policyNumber: policy, status: 'OPEN' });
    const openBody = (await open.json()) as Claim[];
    expect(openBody.map((c) => c.id)).toEqual([openClaim.id]);
  });

  test('TC-L4 returns empty array (not 404) when no claim matches', async ({ claims }) => {
    // Important UX contract: an empty filter result is 200 + [], never a 404.
    // 404 would force callers to special-case "no results" vs "error".
    const res = await claims.list({ policyNumber: 'POL-9999999999' });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test('TC-L5 rejects unknown status filter with 400 INVALID_QUERY_PARAM', async ({ request }) => {
    // Use raw `request` here (not the `claims` fixture) because we're sending
    // an invalid param value that the typed client wouldn't allow.
    const res = await request.get('/claims', { params: { status: 'BOGUS' } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    // Also assert the error body shape matches the Error schema.
    expectSchema(validators.Error, body);
    expect(body.code).toBe('INVALID_QUERY_PARAM');
  });

  test('TC-L6 rejects malformed policyNumber filter with 400', async ({ request }) => {
    // 'not-a-policy' doesn't match ^POL-[0-9]{4,10}$ — server rejects it early.
    const res = await request.get('/claims', { params: { policyNumber: 'not-a-policy' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('INVALID_QUERY_PARAM');
  });
});
