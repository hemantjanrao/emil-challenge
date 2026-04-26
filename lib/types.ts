/**
 * lib/types.ts — canonical TypeScript domain types for the EMIL Claims API.
 *
 * SINGLE SOURCE OF TRUTH
 * ──────────────────────
 * These interfaces mirror the OpenAPI component schemas in `claims-api.yaml`.
 * Both the mock server (`src/`) and the test suite (`tests/`) import from here.
 * If you rename a field or add a new status, you change it in exactly one place
 * and TypeScript surfaces every location that needs updating.
 *
 * WHY KEEP THESE SEPARATE FROM openapi.ts?
 * ─────────────────────────────────────────
 * `lib/openapi.ts` works at runtime (loads YAML, compiles validators).
 * `lib/types.ts` works at compile time (TypeScript type checking only).
 * Keeping them separate means you can import types without triggering the
 * YAML load side-effect, and TypeScript can erase them at compile time.
 */

/**
 * The lifecycle states a claim can be in.
 * The allowed transitions between states are enforced by the mock server's
 * TRANSITIONS lookup table in src/claims-mock-app.ts.
 *
 *   OPEN ──► IN_REVIEW ──► APPROVED ──► PAID
 *                  │
 *                  └──► REJECTED  (terminal — no further moves)
 *
 * Using `Record<ClaimStatus, ClaimStatus[]>` for transitions means TypeScript
 * will error if a new status is added here but not added to that map.
 */
export type ClaimStatus = 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'PAID';

/** Supported payout currencies. EUR is the default when none is specified. */
export type Currency = 'EUR' | 'USD' | 'GBP' | 'CHF';

/**
 * A claim as returned by GET /claims and POST /claims (response body).
 * All fields are always present in responses; payoutAmount and payoutCurrency
 * are optional because they are only set once a claim reaches APPROVED/PAID.
 */
export interface Claim {
  id: string;              // UUID v4, minted by the server — callers cannot supply it
  policyNumber: string;    // Matches ^POL-[0-9]{4,10}$, e.g. "POL-123456"
  claimantName: string;    // minLength: 2
  damageDate: string;      // ISO 8601 date (YYYY-MM-DD), must not be in the future
  lossDescription: string; // minLength: 10
  status: ClaimStatus;     // Starts OPEN; advances via PATCH
  payoutAmount?: number;   // Required when status is APPROVED or PAID
  payoutCurrency?: Currency; // Defaults to EUR if not specified
  createdAt: string;       // ISO 8601 datetime set at creation, never changes
  updatedAt: string;       // ISO 8601 datetime, advances on every successful PATCH
}

/**
 * Request body for POST /claims.
 * `id`, `status` (other than OPEN), `createdAt`, and `updatedAt` are
 * not accepted — the server sets them. `status?: 'OPEN'` is the only allowed
 * value if provided, letting callers be explicit without granting them control.
 */
export interface CreateClaimRequest {
  policyNumber: string;
  claimantName: string;
  damageDate: string;
  lossDescription: string;
  status?: 'OPEN'; // Optional — if supplied, must be exactly 'OPEN'
}

/**
 * Request body for PATCH /claims/{id}.
 * At least one field must be present (enforced by the OpenAPI schema).
 * The server validates that the requested `status` is a legal transition
 * from the current state before applying any changes.
 */
export interface UpdateClaimRequest {
  status?: ClaimStatus;
  payoutAmount?: number;
  payoutCurrency?: Currency;
}

/** One field-level validation problem reported in an error response's `details` array. */
export interface ErrorDetail {
  path: string;  // JSON pointer to the offending field, e.g. "/policyNumber"
  issue: string; // Human-readable description, e.g. "must match pattern ..."
}

/**
 * The standard error envelope returned for all 4xx responses.
 * `code` is the machine-readable identifier; `message` is human-readable.
 * `details` is included for validation errors (400) to name the bad fields.
 */
export interface ErrorResponse {
  code: string;
  message: string;
  details?: ErrorDetail[];
}
