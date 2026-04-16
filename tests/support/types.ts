/**
 * Typed domain models that mirror the OpenAPI schemas in `claims-api.yaml`.
 * Keeping them explicit (rather than generated) is a deliberate tradeoff:
 * the spec is small, and hand-writing types keeps the test code readable
 * while still catching typos at compile time.
 */

export type ClaimStatus = 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PAID';
export type Currency = 'EUR' | 'USD' | 'GBP' | 'CHF';

export interface Claim {
  id: string;
  policyNumber: string;
  claimantName: string;
  damageDate: string;
  lossDescription: string;
  status: ClaimStatus;
  payoutAmount?: number;
  payoutCurrency?: Currency;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClaimRequest {
  policyNumber: string;
  claimantName: string;
  damageDate: string;
  lossDescription: string;
}

export interface UpdateClaimRequest {
  status?: ClaimStatus;
  payoutAmount?: number;
  payoutCurrency?: Currency;
}

export interface ErrorResponse {
  code: string;
  message: string;
  details?: Array<{ path: string; issue: string }>;
}
