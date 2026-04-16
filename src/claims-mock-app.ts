/**
 * EMIL Claims API — in-memory mock server (TypeScript).
 *
 * Design choices:
 *  - Schema validation and the spec are pulled from `lib/openapi.ts`, the
 *    single source of truth shared with the test suite.
 *  - 400 → schema / syntax violations; 422 → business-rule violations;
 *    404 → resource not found. All error bodies match the `Error` schema.
 *  - The status state machine is encoded as a typed `Record` so TypeScript
 *    enforces exhaustiveness if the `ClaimStatus` union ever changes.
 */

import { randomUUID } from 'node:crypto';
import express, { type Request, type Response, type NextFunction, type ErrorRequestHandler } from 'express';
import { spec, getSchemaValidator, formatErrors } from '../lib/openapi.js';
import type { Claim, ClaimStatus, Currency } from '../lib/types.js';

// --- State machine -----------------------------------------------------------

const TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  OPEN: ['IN_REVIEW'],
  IN_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAID'],
  REJECTED: [],
  PAID: [],
};

function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

// --- Validators --------------------------------------------------------------

const validateCreateBody = getSchemaValidator('CreateClaimRequest');
const validateUpdateBody = getSchemaValidator('UpdateClaimRequest');
const validateStatus = getSchemaValidator('ClaimStatus');

// --- Storage -----------------------------------------------------------------

const claims = new Map<string, Claim>();

// --- Helpers -----------------------------------------------------------------

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nowIso(): string {
  return new Date().toISOString();
}

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

function requireObjectBody(req: Request, res: Response): boolean {
  if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
    sendError(res, 400, 'MALFORMED_BODY', 'Request body must be a JSON object.');
    return false;
  }
  return true;
}

// --- App ---------------------------------------------------------------------

export const app = express();

app.use(express.json());

// Wrap Express's bare 400 for malformed JSON into our Error schema.
const jsonParseErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err && (err as { type?: string }).type === 'entity.parse.failed') {
    sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
    return;
  }
  next(err);
};
app.use(jsonParseErrorHandler);

// Request logger (stdout, coloured by status).
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const qs = Object.keys(req.query).length
    ? '?' + new URLSearchParams(req.query as Record<string, string>).toString()
    : '';
  const bodyStr =
    req.body && Object.keys(req.body as object).length
      ? '  body=' + JSON.stringify(req.body)
      : '';

  process.stdout.write(`\u2192  ${req.method.padEnd(6)} ${req.path}${qs}${bodyStr}\n`);

  res.on('finish', () => {
    const ms = Date.now() - start;
    const color =
      res.statusCode < 300 ? '\x1b[32m' : res.statusCode < 500 ? '\x1b[33m' : '\x1b[31m';
    process.stdout.write(
      `${color}\u2190  ${res.statusCode}\x1b[0m  ${req.method} ${req.path}${qs}  (${ms}ms)\n`,
    );
  });

  next();
});

// --- GET /claims -------------------------------------------------------------

app.get('/claims', (req: Request, res: Response) => {
  const { status, policyNumber } = req.query as Record<string, string | undefined>;

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
  if (policyNumber !== undefined && !/^POL-[0-9]{4,10}$/.test(policyNumber)) {
    sendError(res, 400, 'INVALID_QUERY_PARAM', 'policyNumber must match ^POL-[0-9]{4,10}$.');
    return;
  }

  let result = Array.from(claims.values());
  if (status) result = result.filter((c) => c.status === status);
  if (policyNumber) result = result.filter((c) => c.policyNumber === policyNumber);
  result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json(result);
});

// --- POST /claims ------------------------------------------------------------

app.post('/claims', (req: Request, res: Response) => {
  if (!requireObjectBody(req, res)) return;

  if (!validateCreateBody(req.body)) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Request body failed schema validation.', [
      ...formatErrors(validateCreateBody)
        .split('\n')
        .filter(Boolean)
        .map((line) => ({ path: '', issue: line.trim() })),
    ]);
    return;
  }

  const body = req.body as { policyNumber: string; claimantName: string; damageDate: string; lossDescription: string };

  // Business rule: damageDate must not be in the future.
  const damage = new Date(body.damageDate + 'T00:00:00Z');
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  if (damage.getTime() > today.getTime()) {
    sendError(res, 422, 'DAMAGE_DATE_IN_FUTURE', 'damageDate cannot be in the future.');
    return;
  }

  const now = nowIso();
  const claim: Claim = {
    id: randomUUID(),
    policyNumber: body.policyNumber,
    claimantName: body.claimantName,
    damageDate: body.damageDate,
    lossDescription: body.lossDescription,
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
  };
  claims.set(claim.id, claim);
  res.status(201).location(`/claims/${claim.id}`).json(claim);
});

// --- GET /claims/:id ---------------------------------------------------------

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

// --- PATCH /claims/:id -------------------------------------------------------

app.patch('/claims/:id', (req: Request, res: Response) => {
  if (!UUID_V4.test(req.params['id'] ?? '')) {
    sendError(res, 400, 'INVALID_ID', 'id must be a UUID v4.');
    return;
  }
  if (!requireObjectBody(req, res)) return;

  if (!validateUpdateBody(req.body)) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Request body failed schema validation.', [
      ...formatErrors(validateUpdateBody)
        .split('\n')
        .filter(Boolean)
        .map((line) => ({ path: '', issue: line.trim() })),
    ]);
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

  // Status transition check (skip if same as current).
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

  // Invariant: APPROVED and PAID require a payout amount.
  const nextStatus = status ?? claim.status;
  const nextPayout = payoutAmount ?? claim.payoutAmount;
  if ((nextStatus === 'APPROVED' || nextStatus === 'PAID') && nextPayout === undefined) {
    sendError(res, 422, 'PAYOUT_REQUIRED', `payoutAmount is required when status is ${nextStatus}.`);
    return;
  }

  if (status !== undefined) claim.status = status;
  if (payoutAmount !== undefined) claim.payoutAmount = payoutAmount;
  if (payoutCurrency !== undefined) claim.payoutCurrency = payoutCurrency;
  else if (claim.payoutAmount !== undefined && claim.payoutCurrency === undefined) {
    claim.payoutCurrency = 'EUR';
  }
  claim.updatedAt = nowIso();

  res.json(claim);
});

// --- 404 fallback ------------------------------------------------------------

app.use((req: Request, res: Response) => {
  sendError(res, 404, 'ROUTE_NOT_FOUND', `No handler for ${req.method} ${req.path}.`);
});
