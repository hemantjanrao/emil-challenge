/**
 * Canonical domain types for the EMIL Claims API.
 *
 * These are the single source of truth for the TypeScript type system.
 * They mirror the OpenAPI component schemas in `claims-api.yaml`.
 * Both the mock server (`src/`) and the tests (`tests/`) import from here
 * so a rename in one place propagates everywhere.
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

export interface ErrorDetail {
  path: string;
  issue: string;
}

export interface ErrorResponse {
  code: string;
  message: string;
  details?: ErrorDetail[];
}
