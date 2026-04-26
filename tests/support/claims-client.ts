/**
 * tests/support/claims-client.ts — typed API client for the Claims service.
 *
 * WHY A CLIENT CLASS?
 * ───────────────────
 * Playwright gives every test a raw `request` object (APIRequestContext) that
 * can call any URL with any method. Using it directly in specs would mean:
 *   - URL strings scattered everywhere (fragile if the base path changes)
 *   - No TypeScript type-checking on the request body shape
 *   - "Arrange" helpers (create-then-advance) duplicated across spec files
 *
 * ClaimsClient centralises all of that in one place. Specs just call:
 *   await claims.create(payload);
 *   await claims.advanceThrough(id, [{ status: 'IN_REVIEW' }]);
 *
 * PLAYWRIGHT APIRequestContext
 * ────────────────────────────
 * `APIRequestContext` is Playwright's HTTP client. It picks up `baseURL` and
 * default headers from playwright.config.ts, so we never hard-code a host.
 * It returns `APIResponse` objects that expose `.status()`, `.json()`, `.text()`.
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';
import type {
  Claim,
  ClaimStatus,
  CreateClaimRequest,
  ErrorResponse,
  UpdateClaimRequest,
} from './types.js';

/** Optional query-string filters accepted by GET /claims. */
export interface ListFilter {
  status?: ClaimStatus;
  policyNumber?: string;
}

export class ClaimsClient {
  /**
   * The constructor receives Playwright's request context.
   * It is injected automatically via the `claims` fixture in fixtures.ts —
   * specs never call `new ClaimsClient(...)` directly.
   */
  constructor(private readonly request: APIRequestContext) {}

  /**
   * POST /claims — create a new claim.
   * Accepts Partial<> so tests can omit required fields on purpose (negative tests).
   */
  create(body: Partial<CreateClaimRequest>): Promise<APIResponse> {
    return this.request.post('/claims', { data: body });
  }

  /**
   * GET /claims/{id} — fetch a single claim by UUID.
   * encodeURIComponent prevents a bare '/' in a fake id from being treated as a path separator.
   */
  get(id: string): Promise<APIResponse> {
    return this.request.get(`/claims/${encodeURIComponent(id)}`);
  }

  /**
   * PATCH /claims/{id} — update a claim's status and/or payout fields.
   */
  update(id: string, body: UpdateClaimRequest): Promise<APIResponse> {
    return this.request.patch(`/claims/${encodeURIComponent(id)}`, { data: body });
  }

  /**
   * GET /claims — list all claims, with optional status/policyNumber filter.
   * The filter object is passed directly as query-string parameters.
   */
  list(filter: ListFilter = {}): Promise<APIResponse> {
    return this.request.get('/claims', { params: filter as Record<string, string> });
  }

  // ── Arrange helpers ──────────────────────────────────────────────────────
  // These are "arrange" primitives used at the start of a test to set up
  // the state needed for the "act" step. They throw immediately if anything
  // goes wrong so the failure message clearly says "setup failed", not a
  // confusing assertion failure later.

  /**
   * Creates a claim and returns the parsed body.
   * Throws if the server responds with anything other than 201.
   *
   * Use this instead of `create()` when you need the claim's id for follow-up
   * requests and you don't want a separate `expect(res.status()).toBe(201)`.
   */
  async createOrThrow(body: Partial<CreateClaimRequest>): Promise<Claim> {
    const res = await this.create(body);
    if (res.status() !== 201) {
      throw new Error(
        `Arrange step failed: expected 201, got ${res.status()} — ${await res.text()}`,
      );
    }
    return (await res.json()) as Claim;
  }

  /**
   * Walks a claim through a sequence of PATCH transitions.
   * Throws if any step returns a non-200 status.
   *
   * Example — advance to APPROVED:
   *   await claims.advanceThrough(id, [
   *     { status: 'IN_REVIEW' },
   *     { status: 'APPROVED', payoutAmount: 500 },
   *   ]);
   *
   * Returns the body of the LAST response (the claim after all transitions).
   */
  async advanceThrough(id: string, transitions: UpdateClaimRequest[]): Promise<Claim> {
    let body: Claim | undefined;
    for (const t of transitions) {
      const res = await this.update(id, t);
      if (res.status() !== 200) {
        throw new Error(
          `Arrange step failed: PATCH ${id} → ${JSON.stringify(t)} → ${res.status()} — ${await res.text()}`,
        );
      }
      body = (await res.json()) as Claim;
    }
    if (body === undefined) throw new Error('advanceThrough called with empty transitions array');
    return body;
  }
}

// Re-export the domain types so spec files can get everything from one import.
export type { Claim, ClaimStatus, CreateClaimRequest, ErrorResponse, UpdateClaimRequest };
