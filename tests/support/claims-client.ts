/**
 * Reusable API client for the Claims service.
 *
 * Wraps Playwright's `APIRequestContext` with typed methods per operation
 * and exposes both the raw `APIResponse` and a typed parsed body via
 * convenience helpers. Tests should never build paths by hand.
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';
import type {
  Claim,
  ClaimStatus,
  CreateClaimRequest,
  ErrorResponse,
  UpdateClaimRequest,
} from './types';

export interface ListFilter {
  status?: ClaimStatus;
  policyNumber?: string;
}

export class ClaimsClient {
  constructor(private readonly request: APIRequestContext) {}

  create(body: Partial<CreateClaimRequest>): Promise<APIResponse> {
    return this.request.post('/claims', { data: body });
  }

  get(id: string): Promise<APIResponse> {
    return this.request.get(`/claims/${encodeURIComponent(id)}`);
  }

  update(id: string, body: UpdateClaimRequest): Promise<APIResponse> {
    return this.request.patch(`/claims/${encodeURIComponent(id)}`, { data: body });
  }

  list(filter: ListFilter = {}): Promise<APIResponse> {
    return this.request.get('/claims', { params: filter as Record<string, string> });
  }

  /**
   * Create a claim and return the parsed body. Fails loudly if the server
   * returns anything other than 201 — use this in arrange steps only.
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

  /** Advance a claim through a sequence of transitions (throws on any failure). */
  async advanceThrough(id: string, transitions: UpdateClaimRequest[]): Promise<Claim> {
    let body: Claim | undefined;
    for (const t of transitions) {
      const res = await this.update(id, t);
      if (res.status() !== 200) {
        throw new Error(
          `Arrange step failed: PATCH ${id} with ${JSON.stringify(t)} → ${res.status()} — ${await res.text()}`,
        );
      }
      body = (await res.json()) as Claim;
    }
    return body!;
  }
}

export type { Claim, ClaimStatus, CreateClaimRequest, ErrorResponse, UpdateClaimRequest };
