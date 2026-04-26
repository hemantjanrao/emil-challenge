/**
 * src/claims-mock-app.ts — in-memory Express mock for the Claims API.
 *
 * PURPOSE
 * ───────
 * Playwright tests need a server to talk to. Rather than spinning up a real
 * backend (database, auth, etc.), this file creates a lightweight in-memory
 * Express app that behaves like the real service for everything the tests care
 * about: schema validation, status-machine transitions, and error shapes.
 *
 * WHY EXPORT `app` SEPARATELY FROM `app.listen()`?
 * ─────────────────────────────────────────────────
 * `app` is exported here; `app.listen()` is called in src/mock-server.ts.
 * This separation means:
 *   - Playwright's webServer block can import and start the server with a
 *     custom PORT environment variable.
 *   - Integration tests could import `app` directly without binding a port at all.
 *   - The two concerns (routing logic vs. network binding) stay decoupled.
 *
 * STATUS CODE SEMANTICS USED THROUGHOUT
 * ──────────────────────────────────────
 *   400 — schema or syntax violation (wrong type, missing field, invalid UUID format)
 *   404 — resource not found (or unknown route)
 *   422 — business-rule violation (invalid status transition, missing payout,
 *          future damageDate). Contrast with 400: the payload is well-formed
 *          but the business logic rejects it.
 *   201 — created successfully (POST only)
 *   200 — read or update successful
 */

import { randomUUID } from 'node:crypto';
import express, { type Request, type Response, type NextFunction, type ErrorRequestHandler } from 'express';
import { spec, getSchemaValidator } from '../lib/openapi.js';
import type { Claim, ClaimStatus, Currency } from '../lib/types.js';

// ── State machine ─────────────────────────────────────────────────────────────
//
// The allowed transitions are stored as a lookup table:
//   current status → array of statuses it may move to next
//
// OPEN can only go to IN_REVIEW.
// IN_REVIEW can be APPROVED (with payout) or REJECTED.
// APPROVED can only go to PAID.
// REJECTED and PAID are terminal — no further transitions are allowed.
const TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  OPEN:      ['IN_REVIEW'],
  IN_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED:  ['PAID'],
  REJECTED:  [],  // terminal
  PAID:      [],  // terminal
};

/** Returns true only if the `from → to` transition is in the allowed table. */
function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// ── AJV validators ────────────────────────────────────────────────────────────
// Pre-compile the three schemas we validate at runtime.
// validateCreateBody — checks a POST /claims request body.
// validateUpdateBody — checks a PATCH /claims/:id request body.
// validateStatus     — checks a single status string (used for query-string filtering).
const validateCreateBody = getSchemaValidator('CreateClaimRequest');
const validateUpdateBody  = getSchemaValidator('UpdateClaimRequest');
const validateStatus      = getSchemaValidator('ClaimStatus');

// ── In-memory store ───────────────────────────────────────────────────────────
// A Map<id, Claim> acts as the "database". It resets every time the server
// restarts, which keeps tests hermetic — no leftover data between test runs.
const claims = new Map<string, Claim>();

// ── UUID v4 regex ─────────────────────────────────────────────────────────────
// Used to validate the {id} path parameter before hitting the store.
// UUID v4 format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Controls the opt-in request logger (see LOG_REQUESTS block below).
const LOG_REQUESTS = process.env['LOG_REQUESTS'] === 'true';

/** Returns the current time as an ISO 8601 string (e.g. "2026-04-16T10:00:00.000Z"). */
function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Sends a structured error response in the shape defined by the `Error` schema:
 *   { code: string, message: string, details?: [{ path, issue }] }
 *
 * @param res     Express response object
 * @param status  HTTP status code (400, 404, 422, …)
 * @param code    Machine-readable error identifier (e.g. 'VALIDATION_ERROR')
 * @param message Human-readable description
 * @param details Optional array of field-level problems from AJV
 */
function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: Array<{ path: string; issue: string }>,
): void {
  const body: Record<string, unknown> = { code, message };
  if (details?.length) body['details'] = details;
  res.status(status).json(body);
}

/**
 * Guards against non-object bodies (arrays, strings, null).
 * Returns false and sends a 400 if the guard fails, so route handlers can do:
 *   if (!requireObjectBody(req, res)) return;
 */
function requireObjectBody(req: Request, res: Response): boolean {
  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    sendError(res, 400, 'MALFORMED_BODY', 'Request body must be a JSON object.');
    return false;
  }
  return true;
}

// ── Express app ───────────────────────────────────────────────────────────────
export const app = express();

// Parse JSON bodies automatically. Express sets req.body to the parsed object.
// If the body is not valid JSON, Express calls next(err) with a parse error.
app.use(express.json());

// Re-shape Express's default JSON-parse error into our Error schema.
// Without this, a malformed body would return Express's plain "Bad Request"
// HTML page rather than { code: 'INVALID_JSON', message: '...' }.
const jsonParseErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err && (err as { type?: string }).type === 'entity.parse.failed') {
    sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
    return;
  }
  next(err); // pass through any other errors unchanged
};
app.use(jsonParseErrorHandler);

// ── Optional request logger ───────────────────────────────────────────────────
// Run with `LOG_REQUESTS=true npm run start` to see coloured per-request logs.
// Disabled by default so `npm test` output is clean (only test results visible).
//
// ANSI escape codes: \x1b[Xm sets terminal colour (X=32 green, 33 yellow, etc.)
//                    \x1b[0m resets to default.  \x1b[2m dims the text.
if (LOG_REQUESTS) {
  // Map HTTP method names to terminal colour codes.
  const METHOD_COLOR: Record<string, string> = {
    GET:    '\x1b[34m', // blue
    POST:   '\x1b[32m', // green
    PATCH:  '\x1b[33m', // yellow
    PUT:    '\x1b[35m', // magenta
    DELETE: '\x1b[31m', // red
  };

  const statusColor = (code: number): string => {
    if (code < 300) return '\x1b[32m'; // green  — success
    if (code < 400) return '\x1b[36m'; // cyan   — redirect
    if (code < 500) return '\x1b[33m'; // yellow — client error
    return '\x1b[31m';                 // red    — server error
  };

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 23);
    // Reconstruct the query string for display (e.g. ?status=OPEN)
    const qs = Object.keys(req.query).length
      ? '?' + new URLSearchParams(req.query as Record<string, string>).toString()
      : '';
    const mColor = METHOD_COLOR[req.method] ?? '\x1b[37m';
    const dim = '\x1b[2m';
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    const cyan = '\x1b[36m';
    const magenta = '\x1b[35m';

    // Print the inbound request line.
    const line = `${dim}${ts}${reset}  ${mColor}${bold}${req.method.padEnd(6)}${reset}  ${req.path}${qs}`;
    process.stdout.write(`\n${line}\n`);

    // Pretty-print the request body if present.
    if (req.body && Object.keys(req.body as object).length) {
      const pretty = JSON.stringify(req.body, null, 2)
        .split('\n')
        .map((l, i) => (i === 0 ? `  ${cyan}body${reset}  ${l}` : `         ${l}`))
        .join('\n');
      process.stdout.write(pretty + '\n');
    }

    // Monkey-patch res.json() to capture the response body for logging.
    // The patched function calls the original after saving the value.
    let responseBody: unknown;
    const originalJson = res.json.bind(res) as (body: unknown) => Response;
    res.json = (body: unknown): Response => {
      responseBody = body;
      return originalJson(body);
    };

    // Print status + response body after the response is fully sent.
    res.on('finish', () => {
      const ms = Date.now() - start;
      const sc = statusColor(res.statusCode);
      process.stdout.write(`  ${sc}${bold}${res.statusCode}${reset}  ${dim}${ms}ms${reset}\n`);

      if (responseBody !== undefined) {
        const pretty = JSON.stringify(responseBody, null, 2)
          .split('\n')
          .map((l, i) => (i === 0 ? `  ${magenta}resp${reset}  ${l}` : `         ${l}`))
          .join('\n');
        process.stdout.write(pretty + '\n');
      }
    });

    next(); // hand off to the next middleware / route handler
  });
}

// ── Route: GET /claims ────────────────────────────────────────────────────────
// Returns all claims, optionally filtered by status and/or policyNumber.
// Both filters are cumulative (AND, not OR).
app.get('/claims', (req: Request, res: Response) => {
  const { status, policyNumber } = req.query as Record<string, string | undefined>;

  // Validate status query param against the enum before using it.
  if (status !== undefined && !validateStatus(status)) {
    const allowed = (spec.components.schemas['ClaimStatus'] as { enum: string[] }).enum.join(', ');
    sendError(
      res,
      400,
      'INVALID_QUERY_PARAM',
      `Unknown status filter "${status}". Allowed: ${allowed}.`,
    );
    return;
  }
  // Validate policyNumber format (must match ^POL-[0-9]{4,10}$).
  if (policyNumber !== undefined && !/^POL-[0-9]{4,10}$/.test(policyNumber)) {
    sendError(res, 400, 'INVALID_QUERY_PARAM', 'policyNumber must match ^POL-[0-9]{4,10}$.');
    return;
  }

  // Convert the Map to an array, apply filters, then sort by creation time
  // so the order is deterministic (important for list-assertion tests).
  let result = Array.from(claims.values());
  if (status)       result = result.filter((c) => c.status === status);
  if (policyNumber) result = result.filter((c) => c.policyNumber === policyNumber);
  result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json(result);
});

// ── Route: POST /claims ───────────────────────────────────────────────────────
// Creates a new claim. The server always sets status=OPEN and mints the id.
// Returns 201 + the full Claim + a Location header pointing to the new resource.
app.post('/claims', (req: Request, res: Response) => {
  // Guard 1: body must be a JSON object (not an array, null, etc.)
  if (!requireObjectBody(req, res)) return;

  // Guard 2: body must match the CreateClaimRequest schema.
  // AJV checks required fields, string patterns, formats, additionalProperties, etc.
  if (!validateCreateBody(req.body)) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Request body failed schema validation.',
      (validateCreateBody.errors ?? []).map(e => ({
        path: e.instancePath || '/',  // instancePath is empty for top-level errors
        issue: e.message ?? 'invalid',
      })),
    );
    return;
  }

  const body = req.body as {
    policyNumber: string;
    claimantName: string;
    damageDate: string;
    lossDescription: string;
    status?: 'OPEN';
  };

  // Business rule: damageDate must not be in the future.
  // We compare at day granularity (midnight UTC) to avoid timezone edge cases.
  const damage = new Date(body.damageDate + 'T00:00:00Z');
  const today  = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  if (damage.getTime() > today.getTime()) {
    sendError(res, 422, 'DAMAGE_DATE_IN_FUTURE', 'damageDate cannot be in the future.');
    return;
  }

  // Build the claim object the server will store.
  // id       — random UUID v4 minted here (callers cannot supply it)
  // status   — always starts as OPEN regardless of what the caller sent
  // createdAt / updatedAt — both set to now on creation; updatedAt advances on PATCH
  const now = nowIso();
  const claim: Claim = {
    id: randomUUID(),
    policyNumber:    body.policyNumber,
    claimantName:    body.claimantName,
    damageDate:      body.damageDate,
    lossDescription: body.lossDescription,
    status:          'OPEN',
    createdAt:       now,
    updatedAt:       now,
  };
  claims.set(claim.id, claim);

  // 201 Created + Location header pointing to the new resource.
  res.status(201).location(`/claims/${claim.id}`).json(claim);
});

// ── Route: GET /claims/:id ────────────────────────────────────────────────────
// Fetches a single claim. Validates the id format before checking the store
// so that malformed ids return 400 (invalid input) not 404 (not found).
app.get('/claims/:id', (req: Request, res: Response) => {
  if (!UUID_V4.test(req.params['id'] ?? '')) {
    sendError(res, 400, 'INVALID_ID', 'id must be a UUID v4.');
    return;
  }
  const claim = claims.get(req.params['id'] ?? '');
  if (!claim) {
    sendError(res, 404, 'CLAIM_NOT_FOUND', 'Claim does not exist.');
    return;
  }
  res.json(claim);
});

// ── Route: PATCH /claims/:id ──────────────────────────────────────────────────
// Updates a claim's status and/or payout fields.
// Enforces the state machine and payout invariants before applying changes.
app.patch('/claims/:id', (req: Request, res: Response) => {
  // Validate id format first.
  if (!UUID_V4.test(req.params['id'] ?? '')) {
    sendError(res, 400, 'INVALID_ID', 'id must be a UUID v4.');
    return;
  }
  if (!requireObjectBody(req, res)) return;

  // Validate body against UpdateClaimRequest schema
  // (at least one of status/payoutAmount/payoutCurrency must be present).
  if (!validateUpdateBody(req.body)) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Request body failed schema validation.',
      (validateUpdateBody.errors ?? []).map(e => ({
        path: e.instancePath || '/',
        issue: e.message ?? 'invalid',
      })),
    );
    return;
  }

  const claim = claims.get(req.params['id'] ?? '');
  if (!claim) {
    sendError(res, 404, 'CLAIM_NOT_FOUND', 'Claim does not exist.');
    return;
  }

  const { status, payoutAmount, payoutCurrency } = req.body as {
    status?: ClaimStatus;
    payoutAmount?: number;
    payoutCurrency?: Currency;
  };

  // ── Business rule 1: Status transition must be allowed by the state machine.
  // We skip the check when the requested status equals the current one
  // (a self-transition is a no-op, not an error).
  if (status !== undefined && status !== claim.status) {
    if (!canTransition(claim.status, status)) {
      const allowed = TRANSITIONS[claim.status].join(', ') || 'none (terminal)';
      sendError(
        res,
        422,
        'INVALID_STATUS_TRANSITION',
        `Cannot transition ${claim.status} → ${status}. Allowed from ${claim.status}: ${allowed}.`,
      );
      return;
    }
  }

  // Compute what the claim's status and payout will be AFTER this request
  // (combining the existing stored values with the incoming patch values).
  // We need these "next" values to evaluate the invariants below.
  const nextStatus = status ?? claim.status;            // if no new status, keep current
  const nextPayout = payoutAmount ?? claim.payoutAmount; // if no new amount, keep current
  const payoutTouched = payoutAmount !== undefined || payoutCurrency !== undefined;

  // ── Business rule 2: Payout fields are only allowed once APPROVED or PAID.
  // A caller setting payoutAmount on an OPEN claim is a bug we reject early.
  if (payoutTouched && nextStatus !== 'APPROVED' && nextStatus !== 'PAID') {
    sendError(
      res,
      422,
      'PAYOUT_NOT_ALLOWED',
      'Payout fields can only be set once a claim is APPROVED or PAID.',
    );
    return;
  }

  // ── Business rule 3: APPROVED and PAID must have a payoutAmount.
  // If the transition goes to APPROVED/PAID but there is no payout (neither
  // already on the claim nor supplied in this request), reject it.
  if ((nextStatus === 'APPROVED' || nextStatus === 'PAID') && nextPayout === undefined) {
    sendError(res, 422, 'PAYOUT_REQUIRED', `payoutAmount is required when status is ${nextStatus}.`);
    return;
  }

  // ── Apply changes to the stored claim object (mutating in-place is safe here
  //    because the Map holds object references, not copies).
  if (status !== undefined)        claim.status = status;
  if (payoutAmount !== undefined)  claim.payoutAmount = payoutAmount;
  if (payoutCurrency !== undefined) {
    claim.payoutCurrency = payoutCurrency;
  } else if (claim.payoutAmount !== undefined && claim.payoutCurrency === undefined) {
    // Default currency to EUR when payout amount is set but no currency was specified.
    claim.payoutCurrency = 'EUR';
  }
  claim.updatedAt = nowIso(); // always advance updatedAt on a successful PATCH

  res.json(claim);
});

// ── 404 fallback ──────────────────────────────────────────────────────────────
// Catches any request that didn't match a route above (e.g. DELETE /claims).
// Express requires this to be registered last, after all other routes.
app.use((req: Request, res: Response) => {
  sendError(res, 404, 'ROUTE_NOT_FOUND', `No handler for ${req.method} ${req.path}.`);
});
