/**
 * PATCH /claims/{id} — status transitions and invariants.
 *
 * The full transition graph is:
 *
 *   OPEN ──► IN_REVIEW ──► APPROVED ──► PAID
 *                 │
 *                 └──► REJECTED
 *
 * Rather than exhaustively testing every forbidden (from, to) pair, the
 * cases below pick the most risk-representative ones:
 *   - skipping a step (OPEN → APPROVED, OPEN → PAID)
 *   - going backwards (IN_REVIEW → OPEN)
 *   - moving out of a terminal state (PAID → anything)
 * Those four patterns cover the realistic ways a client might misuse the API.
 * The full state machine is documented in test-cases.md if exhaustive
 * coverage is ever needed.
 */

import { test, expect, expectSchema, validators } from '../support/fixtures.js';
import { aValidCreateClaim } from '../support/claim-builder.js';
import type { UpdateClaimRequest } from '../support/types.js';

test.describe('PATCH /claims/{id}', () => {

  // --- Happy paths -----------------------------------------------------------

  test('TC-U1 full workflow: OPEN → IN_REVIEW → APPROVED → PAID', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());

    await claims.update(claim.id, { status: 'IN_REVIEW' }).then(async r => {
      expect(r.status()).toBe(200);
      expect((await r.json()).status).toBe('IN_REVIEW');
    });

    const approved = await claims.update(claim.id, { status: 'APPROVED', payoutAmount: 1500, payoutCurrency: 'EUR' });
    expect(approved.status()).toBe(200);
    const approvedBody = await approved.json();
    expectSchema(validators.Claim, approvedBody);
    expect(approvedBody).toMatchObject({ status: 'APPROVED', payoutAmount: 1500, payoutCurrency: 'EUR' });

    const paid = await claims.update(claim.id, { status: 'PAID' });
    expect(paid.status()).toBe(200);
    expect((await paid.json()).status).toBe('PAID');
  });

  test('TC-U2 rejection branch: OPEN → IN_REVIEW → REJECTED', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    await claims.advanceThrough(claim.id, [{ status: 'IN_REVIEW' }]);
    const res = await claims.update(claim.id, { status: 'REJECTED' });
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('REJECTED');
  });

  test('TC-U3 updatedAt advances; createdAt stays fixed', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    await new Promise(r => setTimeout(r, 5));
    const res = await claims.update(claim.id, { status: 'IN_REVIEW' });
    const body = await res.json();
    expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(new Date(claim.updatedAt).getTime());
    expect(body.createdAt).toBe(claim.createdAt);
  });

  // --- Invalid transitions (representative set) ------------------------------

  test('TC-U4a rejects skipping a step: OPEN → APPROVED', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.update(claim.id, { status: 'APPROVED', payoutAmount: 100 });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('TC-U4b rejects skipping to terminal: OPEN → PAID', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.update(claim.id, { status: 'PAID', payoutAmount: 100 });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('TC-U4c rejects going backwards: IN_REVIEW → OPEN', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    await claims.advanceThrough(claim.id, [{ status: 'IN_REVIEW' }]);
    const res = await claims.update(claim.id, { status: 'OPEN' });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('TC-U4d rejects any move out of a terminal state: PAID → IN_REVIEW', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    await claims.advanceThrough(claim.id, [
      { status: 'IN_REVIEW' },
      { status: 'APPROVED', payoutAmount: 100 },
      { status: 'PAID' },
    ]);
    const res = await claims.update(claim.id, { status: 'IN_REVIEW' });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expectSchema(validators.Error, body);
    expect(body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  // --- Invariants ------------------------------------------------------------

  test('TC-U5 APPROVED without payoutAmount → 422 PAYOUT_REQUIRED', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    await claims.advanceThrough(claim.id, [{ status: 'IN_REVIEW' }]);
    const res = await claims.update(claim.id, { status: 'APPROVED' });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe('PAYOUT_REQUIRED');
  });

  test('TC-U6 PAID inherits payoutAmount set at APPROVED', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    await claims.advanceThrough(claim.id, [
      { status: 'IN_REVIEW' },
      { status: 'APPROVED', payoutAmount: 999 },
    ]);
    const res = await claims.update(claim.id, { status: 'PAID' });
    expect(res.status()).toBe(200);
    expect((await res.json())).toMatchObject({ status: 'PAID', payoutAmount: 999 });
  });

  test('TC-U7 payout fields before APPROVED → 422 PAYOUT_NOT_ALLOWED', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.update(claim.id, { payoutAmount: 100 });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe('PAYOUT_NOT_ALLOWED');
  });

  // --- Input validation ------------------------------------------------------

  test('TC-U8 invalid status value → 400', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.update(claim.id, { status: 'NOT_A_STATUS' as never });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION_ERROR');
  });

  test('TC-U9 non-existent claim → 404', async ({ claims }) => {
    const res = await claims.update('99999999-9999-4999-8999-999999999999', { status: 'IN_REVIEW' });
    expect(res.status()).toBe(404);
    expect((await res.json()).code).toBe('CLAIM_NOT_FOUND');
  });
});

// helpers used in arrange steps only
export type { UpdateClaimRequest };
