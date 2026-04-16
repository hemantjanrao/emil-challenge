/**
 * PATCH /claims/{id} — state machine + invariants.
 *
 *   OPEN ──► IN_REVIEW ──► APPROVED ──► PAID
 *                 │
 *                 └──► REJECTED
 *
 * Any transition not drawn above must return 422 INVALID_STATUS_TRANSITION.
 * APPROVED and PAID both require a non-zero payoutAmount.
 */

import { test, expect, expectSchema, validators } from '../support/fixtures.js';
import { aValidCreateClaim } from '../support/claim-builder.js';
import type { ClaimStatus, UpdateClaimRequest } from '../support/types.js';

const ALL_STATUSES: ClaimStatus[] = ['OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PAID'];
const ALLOWED: Record<ClaimStatus, ClaimStatus[]> = {
  OPEN: ['IN_REVIEW'],
  IN_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAID'],
  REJECTED: [],
  PAID: [],
};

test.describe('PATCH /claims/{id} — happy paths', () => {
  test('TC-U1 walks OPEN → IN_REVIEW → APPROVED → PAID with payout', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());

    const review = await claims.update(claim.id, { status: 'IN_REVIEW' });
    expect(review.status()).toBe(200);
    expect((await review.json()).status).toBe('IN_REVIEW');

    const approved = await claims.update(claim.id, {
      status: 'APPROVED',
      payoutAmount: 1500.5,
      payoutCurrency: 'EUR',
    });
    expect(approved.status()).toBe(200);
    const approvedBody = await approved.json();
    expectSchema(validators.Claim, approvedBody);
    expect(approvedBody).toMatchObject({
      status: 'APPROVED',
      payoutAmount: 1500.5,
      payoutCurrency: 'EUR',
    });

    const paid = await claims.update(claim.id, { status: 'PAID' });
    expect(paid.status()).toBe(200);
    expect((await paid.json()).status).toBe('PAID');
  });

  test('TC-U2 takes the rejection branch OPEN → IN_REVIEW → REJECTED', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    await claims.advanceThrough(claim.id, [{ status: 'IN_REVIEW' }]);
    const res = await claims.update(claim.id, { status: 'REJECTED' });
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('REJECTED');
  });

  test('TC-U3 bumps updatedAt on every successful transition', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    await new Promise((r) => setTimeout(r, 5));
    const res = await claims.update(claim.id, { status: 'IN_REVIEW' });
    const body = await res.json();
    expect(new Date(body.updatedAt).getTime()).toBeGreaterThan(
      new Date(claim.updatedAt).getTime(),
    );
    expect(body.createdAt).toBe(claim.createdAt);
  });
});

test.describe('PATCH /claims/{id} — invalid transition matrix', () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      if (from === to || ALLOWED[from].includes(to)) continue;

      test(`TC-U4 rejects ${from} → ${to} with 422 INVALID_STATUS_TRANSITION`, async ({ claims }) => {
        const claim = await claims.createOrThrow(aValidCreateClaim());
        const arrange = arrangeTransitions(from);
        if (arrange.length) await claims.advanceThrough(claim.id, arrange);

        const res = await claims.update(claim.id, toUpdateBody(to));
        expect(res.status(), await res.text()).toBe(422);
        const body = await res.json();
        expectSchema(validators.Error, body);
        expect(body.code).toBe('INVALID_STATUS_TRANSITION');
      });
    }
  }

  test('TC-U5 self-transition (status=current) is a no-op 200', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.update(claim.id, { status: 'OPEN' });
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe('OPEN');
  });
});

test.describe('PATCH /claims/{id} — invariants and edge cases', () => {
  test('TC-U6 APPROVED without payoutAmount → 422 PAYOUT_REQUIRED', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    await claims.advanceThrough(claim.id, [{ status: 'IN_REVIEW' }]);
    const res = await claims.update(claim.id, { status: 'APPROVED' });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe('PAYOUT_REQUIRED');
  });

  test('TC-U7 PAID keeps the payoutAmount set at APPROVED (no need to resend)', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    await claims.advanceThrough(claim.id, [
      { status: 'IN_REVIEW' },
      { status: 'APPROVED', payoutAmount: 999 },
    ]);
    const res = await claims.update(claim.id, { status: 'PAID' });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'PAID', payoutAmount: 999 });
  });

  test('TC-U8 rejects invalid status value with 400 VALIDATION_ERROR', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.update(claim.id, { status: 'NOT_A_STATUS' as never });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION_ERROR');
  });

  test('TC-U9 rejects empty body with 400 (minProperties=1)', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.update(claim.id, {});
    expect(res.status()).toBe(400);
  });

  test('TC-U10 rejects unknown field with 400', async ({ claims }) => {
    const claim = await claims.createOrThrow(aValidCreateClaim());
    const res = await claims.update(claim.id, { foo: 'bar' } as never);
    expect(res.status()).toBe(400);
  });

  test('TC-U11 returns 404 when updating a non-existent claim', async ({ claims }) => {
    const res = await claims.update('99999999-9999-4999-8999-999999999999', {
      status: 'IN_REVIEW',
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).code).toBe('CLAIM_NOT_FOUND');
  });

  for (const arrange of [
    { name: 'OPEN claim', transitions: [] },
    { name: 'IN_REVIEW claim', transitions: [{ status: 'IN_REVIEW' } satisfies UpdateClaimRequest] },
  ]) {
    test(`TC-U12 rejects payout fields before approval for an ${arrange.name}`, async ({ claims }) => {
      const claim = await claims.createOrThrow(aValidCreateClaim());
      if (arrange.transitions.length) await claims.advanceThrough(claim.id, arrange.transitions);

      const res = await claims.update(claim.id, { payoutAmount: 100 });
      expect(res.status(), await res.text()).toBe(422);
      expect((await res.json()).code).toBe('PAYOUT_NOT_ALLOWED');
    });
  }
});

// --- helpers -----------------------------------------------------------------

function arrangeTransitions(target: ClaimStatus): UpdateClaimRequest[] {
  switch (target) {
    case 'OPEN':
      return [];
    case 'IN_REVIEW':
      return [{ status: 'IN_REVIEW' }];
    case 'APPROVED':
      return [{ status: 'IN_REVIEW' }, { status: 'APPROVED', payoutAmount: 100 }];
    case 'REJECTED':
      return [{ status: 'IN_REVIEW' }, { status: 'REJECTED' }];
    case 'PAID':
      return [
        { status: 'IN_REVIEW' },
        { status: 'APPROVED', payoutAmount: 100 },
        { status: 'PAID' },
      ];
  }
}

function toUpdateBody(to: ClaimStatus): UpdateClaimRequest {
  // Supply payout so the server reaches the transition check rather than
  // the payout-required invariant check.
  if (to === 'APPROVED' || to === 'PAID') {
    return { status: to, payoutAmount: 100 };
  }
  return { status: to };
}
