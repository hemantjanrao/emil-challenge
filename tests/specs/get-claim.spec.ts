import { test, expect, expectSchema, validators } from '../support/fixtures.js';
import { aValidCreateClaim } from '../support/claim-builder.js';

test.describe('GET /claims/{id}', () => {
  test('TC-G1 returns 200 and a schema-valid Claim for an existing id', async ({ claims }) => {
    const created = await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.get(created.id);
    expect(res.status()).toBe(200);
    expectSchema(validators.Claim, await res.json());
  });

  test('TC-G2 returns 404 for an unknown id', async ({ claims }) => {
    const res = await claims.get('11111111-2222-4333-8444-555555555555');
    expect(res.status()).toBe(404);
    expect((await res.json()).code).toBe('CLAIM_NOT_FOUND');
  });

  test('TC-G3 returns 400 for a non-UUID path segment', async ({ claims }) => {
    const res = await claims.get('not-a-uuid');
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('INVALID_ID');
  });
});
