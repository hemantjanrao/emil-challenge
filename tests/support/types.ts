/**
 * Re-exports from `lib/types.ts` so spec files keep the same short import
 * paths (`../support/types.js`) while the canonical definition lives in one
 * place shared with the mock server.
 */
export type {
  Claim,
  ClaimStatus,
  Currency,
  CreateClaimRequest,
  UpdateClaimRequest,
  ErrorDetail,
  ErrorResponse,
} from '../../lib/types.js';
