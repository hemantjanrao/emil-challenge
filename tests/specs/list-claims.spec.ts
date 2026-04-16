/**
 * GET /claims — list / filter.
 */

import { test, expect, expectSchema, validators } from '../support/fixtures.js';
import { aValidCreateClaim } from '../support/claim-builder.js';
import type { Claim } from '../support/types.js';

test.describe('GET /claims', () => {
  test('TC-L1 returns a schema-valid array (possibly empty)', async ({ claims }) => {
    const res = await claims.list();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expectSchema(validators.ClaimsList, body);
  });

  test('TC-L2 filters by policyNumber (exact match)', async ({ claims }) => {
    const payload = aValidCreateClaim();
    const created = await claims.createOrThrow(payload);

    const res = await claims.list({ policyNumber: payload.policyNumber });
    expect(res.status()).toBe(200);

    const body = (await res.json()) as Claim[];
    expectSchema(validators.ClaimsList, body);
    expect(body).toHaveLength(1);
    expect(body[0]).toEqual(created);
  });

  test('TC-L3 filters by status — returned rows all have that status', async ({ claims }) => {
    const policy = aValidCreateClaim().policyNumber;
    const openClaim = await claims.createOrThrow(aValidCreateClaim({ policyNumber: policy }));
    const reviewClaim = await claims.createOrThrow(aValidCreateClaim({ policyNumber: policy }));
    await claims.advanceThrough(reviewClaim.id, [{ status: 'IN_REVIEW' }]);

    const inReview = await claims.list({ policyNumber: policy, status: 'IN_REVIEW' });
    expect(inReview.status()).toBe(200);
    const inReviewBody = (await inReview.json()) as Claim[];
    expect(inReviewBody.map((c) => c.id)).toEqual([reviewClaim.id]);
    expect(inReviewBody.every((c) => c.status === 'IN_REVIEW')).toBe(true);

    const open = await claims.list({ policyNumber: policy, status: 'OPEN' });
    const openBody = (await open.json()) as Claim[];
    expect(openBody.map((c) => c.id)).toEqual([openClaim.id]);
  });

  test('TC-L4 returns empty array (not 404) when no claim matches', async ({ claims }) => {
    const res = await claims.list({ policyNumber: 'POL-9999999999' });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test('TC-L5 rejects unknown status filter with 400 INVALID_QUERY_PARAM', async ({ request }) => {
    const res = await request.get('/claims', { params: { status: 'BOGUS' } });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expectSchema(validators.Error, body);
    expect(body.code).toBe('INVALID_QUERY_PARAM');
  });

  test('TC-L6 rejects malformed policyNumber filter with 400', async ({ request }) => {
    const res = await request.get('/claims', { params: { policyNumber: 'not-a-policy' } });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('INVALID_QUERY_PARAM');
  });
});
