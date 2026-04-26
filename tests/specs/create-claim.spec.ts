/**
 * tests/specs/create-claim.spec.ts — POST /claims (create a claim)
 *
 * Covers:
 *   TC-C1 — happy path: 201 + schema-valid body + Location header + status=OPEN
 *   TC-C2 — created claim is persisted and fetchable by id
 *   TC-C3 — explicit status=OPEN is accepted (it's the only allowed value)
 *   TC-C4 — server-generated id cannot be supplied by the caller
 *   TC-C5 — (×4) each required field, missing one at a time → 400
 *   TC-C6 — (×9) each field with an invalid value → 400
 *   TC-C7 — damageDate in the future → 422 (business rule, not schema)
 *   TC-C8 — non-JSON body → 400 INVALID_JSON
 *   TC-C9 — error body matches the Error schema + details has field paths
 *
 * DATA-DRIVEN PATTERN (TC-C5, TC-C6)
 * ────────────────────────────────────
 * Instead of writing 13 nearly-identical test functions, the negative cases
 * are stored in arrays of `Case` objects. A `for` loop iterates over each
 * case and generates one test per entry via `test(...)`. This keeps the
 * test count accurate (each entry is a distinct registered test) while
 * eliminating the boilerplate of repeating the same assertion pattern.
 *
 * To add a new negative case, append an entry to `missingFields` or
 * `invalidValues` — no new test function needed.
 */

import { test, expect, expectSchema, validators } from '../support/fixtures.js';
import { aValidCreateClaim } from '../support/claim-builder.js';
import type { Claim } from '../support/types.js';

test.describe('POST /claims', () => {
  test('TC-C1 creates a claim with status=OPEN and a Location header', async ({ claims }) => {
    const payload = aValidCreateClaim();
    const res = await claims.create(payload);

    expect(res.status(), await res.text()).toBe(201);
    expect(res.headers()['location']).toMatch(/^\/claims\/[0-9a-f-]{36}$/i);

    const body = (await res.json()) as Claim;
    expectSchema(validators.Claim, body);
    expect(body).toMatchObject({
      status: 'OPEN',
      policyNumber: payload.policyNumber,
      claimantName: payload.claimantName,
      damageDate: payload.damageDate,
      lossDescription: payload.lossDescription,
    });
    expect(body.createdAt).toBe(body.updatedAt);
    expect(body.payoutAmount).toBeUndefined();
  });

  test('TC-C2 persists the created claim so it can be fetched by id', async ({ claims }) => {
    const created = await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.get(created.id);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual(created);
  });

  test('TC-C3 accepts explicit status=OPEN on create', async ({ claims }) => {
    const res = await claims.create({ ...aValidCreateClaim(), status: 'OPEN' });
    expect(res.status(), await res.text()).toBe(201);
    expect((await res.json()).status).toBe('OPEN');
  });

  test('TC-C4 rejects any caller-supplied id (server mints it)', async ({ claims }) => {
    const attempted = '00000000-0000-4000-8000-000000000000';
    const res = await claims.create({ ...aValidCreateClaim(), id: attempted } as never);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // --- Negative matrix -------------------------------------------------------

  type Case = {
    name: string;
    patch: Record<string, unknown>;
    expectedStatus: number;
    expectedCode?: string;
  };

  const missingFields: Case[] = [
    { name: 'policyNumber missing', patch: { policyNumber: undefined }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
    { name: 'claimantName missing', patch: { claimantName: undefined }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
    { name: 'damageDate missing', patch: { damageDate: undefined }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
    { name: 'lossDescription missing', patch: { lossDescription: undefined }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
  ];

  for (const c of missingFields) {
    test(`TC-C5 rejects payloads where ${c.name}`, async ({ claims }) => {
      const base = aValidCreateClaim();
      const payload = { ...base, ...c.patch };
      for (const k of Object.keys(c.patch)) {
        if (c.patch[k] === undefined) delete (payload as Record<string, unknown>)[k];
      }
      const res = await claims.create(payload);
      expect(res.status(), await res.text()).toBe(c.expectedStatus);
      if (c.expectedCode) expect((await res.json()).code).toBe(c.expectedCode);
    });
  }

  const invalidValues: Case[] = [
    { name: 'policyNumber wrong pattern', patch: { policyNumber: 'XYZ-1' }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
    { name: 'policyNumber empty string', patch: { policyNumber: '' }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
    { name: 'claimantName too short', patch: { claimantName: 'A' }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
    { name: 'claimantName wrong type', patch: { claimantName: 42 }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
    { name: 'damageDate not ISO', patch: { damageDate: '10/03/2026' }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
    { name: 'damageDate nonsense', patch: { damageDate: 'not-a-date' }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
    { name: 'lossDescription too short', patch: { lossDescription: 'oops' }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
    { name: 'initial status is not OPEN', patch: { status: 'IN_REVIEW' }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
    { name: 'unknown field', patch: { secretField: 'nope' }, expectedStatus: 400, expectedCode: 'VALIDATION_ERROR' },
  ];

  for (const c of invalidValues) {
    test(`TC-C6 rejects when ${c.name}`, async ({ claims }) => {
      const res = await claims.create({ ...aValidCreateClaim(), ...c.patch });
      expect(res.status(), await res.text()).toBe(c.expectedStatus);
      if (c.expectedCode) expect((await res.json()).code).toBe(c.expectedCode);
    });
  }

  test('TC-C7 rejects damageDate in the future with 422 (business rule)', async ({ claims }) => {
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
    const res = await claims.create({ ...aValidCreateClaim(), damageDate: future });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe('DAMAGE_DATE_IN_FUTURE');
  });

  test('TC-C8 rejects non-JSON body with 400 INVALID_JSON', async ({ request }) => {
    const res = await request.post('/claims', {
      headers: { 'content-type': 'application/json' },
      data: '{not json',
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_JSON');
  });

  test('TC-C9 error body conforms to Error schema and details has field paths', async ({ claims }) => {
    const res = await claims.create({});
    expect(res.status()).toBe(400);
    const body = await res.json();
    expectSchema(validators.Error, body);
    expect(body.details).toBeDefined();
    expect(body.details.length).toBeGreaterThan(0);
    // Each detail must have a non-empty path — not the empty string the old mock produced.
    for (const d of body.details) {
      expect(typeof d.path).toBe('string');
      expect(d.path.length).toBeGreaterThan(0);
    }
  });
});
