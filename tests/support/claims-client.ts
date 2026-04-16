/**
 * Typed, reusable API client for the Claims service.
 *
 * Wraps Playwright's `APIRequestContext` so specs never build URLs by hand
 * and all operation signatures are type-checked.
 */

import type { APIRequestContext, APIResponse } from '@playwright/test';
import type {
  Claim,
  ClaimStatus,
  CreateClaimRequest,
  ErrorResponse,
  UpdateClaimRequest,
} from './types.js';

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

  /** Arrange step: create a claim, throw on anything other than 201. */
  async createOrThrow(body: Partial<CreateClaimRequest>): Promise<Claim> {
    const res = await this.create(body);
    if (res.status() !== 201) {
      throw new Error(
        `Arrange step failed: expected 201, got ${res.status()} — ${await res.text()}`,
      );
    }
    return (await res.json()) as Claim;
  }

  /** Arrange step: advance a claim through a sequence of transitions. */
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

export type { Claim, ClaimStatus, CreateClaimRequest, ErrorResponse, UpdateClaimRequest };
