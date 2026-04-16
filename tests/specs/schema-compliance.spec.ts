/**
 * Spec-level smoke suite: every response the API emits validates against
 * the schema declared in `claims-api.yaml`. If the spec and the server
 * drift, this suite fails immediately.
 */

import { test, expect, expectSchema, validators } from '../support/fixtures.js';
import { aValidCreateClaim } from '../support/claim-builder.js';

test.describe('Schema compliance — every response matches claims-api.yaml', () => {
  test('POST /claims 201 → Claim', async ({ claims }) => {
    const res = await claims.create(aValidCreateClaim());
    expect(res.status()).toBe(201);
    expectSchema(validators.Claim, await res.json());
  });

  test('GET /claims/{id} 200 → Claim', async ({ claims }) => {
    const created = await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.get(created.id);
    expect(res.status()).toBe(200);
    expectSchema(validators.Claim, await res.json());
  });

  test('PATCH /claims/{id} 200 → Claim (with payout fields populated)', async ({ claims }) => {
    const created = await claims.createOrThrow(aValidCreateClaim());
    await claims.advanceThrough(created.id, [{ status: 'IN_REVIEW' }]);
    const res = await claims.update(created.id, { status: 'APPROVED', payoutAmount: 42 });
    expect(res.status()).toBe(200);
    expectSchema(validators.Claim, await res.json());
  });

  test('GET /claims 200 → array of Claim', async ({ claims }) => {
    await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.list();
    expect(res.status()).toBe(200);
    expectSchema(validators.ClaimsList, await res.json());
  });

  test('Error bodies (400 / 404 / 422) all match Error schema', async ({ claims, request }) => {
    const cases = [
      () => claims.create({}),
      () => claims.get('not-a-uuid'),
      () => claims.get('11111111-2222-4333-8444-555555555555'),
      () => request.get('/claims', { params: { status: 'BOGUS' } }),
      async () => {
        const c = await claims.createOrThrow(aValidCreateClaim());
        return claims.update(c.id, { status: 'PAID' });
      },
    ];

    for (const run of cases) {
      const res = await run();
      expect([400, 404, 422]).toContain(res.status());
      expectSchema(validators.Error, await res.json());
    }
  });
});
