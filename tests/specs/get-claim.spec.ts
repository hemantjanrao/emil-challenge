/**
 * GET /claims/{id}
 */

import { test, expect, expectSchema, validators } from '../support/fixtures.js';
import { aValidCreateClaim } from '../support/claim-builder.js';

test.describe('GET /claims/{id}', () => {
  test('TC-G1 returns 200 and a schema-valid Claim for an existing id', async ({ claims }) => {
    const created = await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.get(created.id);

    expect(res.status()).toBe(200);
    const body = await res.json();
    expectSchema(validators.Claim, body);
    expect(body.id).toBe(created.id);
  });

  test('TC-G2 returns 404 CLAIM_NOT_FOUND for a valid-but-unknown UUID', async ({ claims }) => {
    const unknown = '11111111-2222-4333-8444-555555555555';
    const res = await claims.get(unknown);

    expect(res.status()).toBe(404);
    const body = await res.json();
    expectSchema(validators.Error, body);
    expect(body.code).toBe('CLAIM_NOT_FOUND');
  });

  test('TC-G3 returns 400 INVALID_ID for a non-UUID id', async ({ claims }) => {
    const res = await claims.get('not-a-uuid');

    expect(res.status()).toBe(400);
    const body = await res.json();
    expectSchema(validators.Error, body);
    expect(body.code).toBe('INVALID_ID');
  });

  test('TC-G4 returns 400 INVALID_ID for a valid UUID that is not version 4', async ({ claims }) => {
    const uuidV1 = '11111111-2222-1333-8444-555555555555';
    const res = await claims.get(uuidV1);

    expect(res.status()).toBe(400);
    const body = await res.json();
    expectSchema(validators.Error, body);
    expect(body.code).toBe('INVALID_ID');
  });
});
