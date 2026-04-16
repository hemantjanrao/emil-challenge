/**
 * EMIL Claims API — in-memory mock server.
 *
 * Why this exists: the take-home doesn't require a real backend, but a thin
 * mock with realistic validation lets us write *meaningful* tests (state
 * machine, invariants, strict input validation) rather than tautologies.
 *
 * Design choices:
 *  - Request/response schemas are derived from `claims-api.yaml` at boot,
 *    so the mock and the tests share a single source of truth.
 *  - 400 is used for *schema* violations, 422 for *business rule*
 *    violations (invalid status transition, missing payout on APPROVED).
 *  - Errors follow the `Error` schema defined in the OpenAPI spec.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const yaml = require('yaml');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// --- Load OpenAPI spec & build AJV validators --------------------------------

const specPath = path.join(__dirname, 'claims-api.yaml');
const spec = yaml.parse(fs.readFileSync(specPath, 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false, useDefaults: false });
addFormats(ajv);

// Register each component schema under a $ref-friendly key so AJV can resolve
// `#/components/schemas/...` the same way the spec uses them.
for (const [name, schema] of Object.entries(spec.components.schemas)) {
  ajv.addSchema(schema, `#/components/schemas/${name}`);
}

const validateCreateBody = ajv.getSchema('#/components/schemas/CreateClaimRequest');
const validateUpdateBody = ajv.getSchema('#/components/schemas/UpdateClaimRequest');
const validateStatus = ajv.compile(spec.components.schemas.ClaimStatus);

// --- Storage -----------------------------------------------------------------

/** @type {Map<string, import('./types').Claim>} */
const claims = new Map();

// --- Domain: status state machine -------------------------------------------

const TRANSITIONS = {
  OPEN: ['IN_REVIEW'],
  IN_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['PAID'],
  REJECTED: [],
  PAID: [],
};

function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

// --- Helpers -----------------------------------------------------------------

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nowIso() {
  return new Date().toISOString();
}

function errorBody(code, message, details) {
  const body = { code, message };
  if (details && details.length) body.details = details;
  return body;
}

function ajvDetails(errors) {
  return (errors || []).map((e) => ({
    path: e.instancePath || e.schemaPath,
    issue: e.message || 'invalid',
  }));
}

function sendError(res, status, code, message, details) {
  return res.status(status).json(errorBody(code, message, details));
}

// Reject bodies that are not objects (arrays, null, strings, numbers).
function requireObjectBody(req, res) {
  if (
    req.body === null ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body)
  ) {
    sendError(res, 400, 'MALFORMED_BODY', 'Request body must be a JSON object.');
    return false;
  }
  return true;
}

// --- App ---------------------------------------------------------------------

const app = express();

// Express 4 returns a bare 400 for malformed JSON — wrap to return our Error schema.
app.use(express.json());
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
  next(err);
});

// --- GET /claims -------------------------------------------------------------

app.get('/claims', (req, res) => {
  const { status, policyNumber } = req.query;

  if (status !== undefined && !validateStatus(status)) {
    return sendError(
      res,
      400,
      'INVALID_QUERY_PARAM',
      `Unknown status filter "${status}". Allowed: ${spec.components.schemas.ClaimStatus.enum.join(', ')}.`
    );
  }
  if (policyNumber !== undefined && !/^POL-[0-9]{4,10}$/.test(String(policyNumber))) {
    return sendError(
      res,
      400,
      'INVALID_QUERY_PARAM',
      'policyNumber must match pattern ^POL-[0-9]{4,10}$.'
    );
  }

  let result = Array.from(claims.values());
  if (status) result = result.filter((c) => c.status === status);
  if (policyNumber) result = result.filter((c) => c.policyNumber === policyNumber);

  // Stable ordering so list assertions are deterministic.
  result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json(result);
});

// --- POST /claims ------------------------------------------------------------

app.post('/claims', (req, res) => {
  if (!requireObjectBody(req, res)) return;

  if (!validateCreateBody(req.body)) {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'Request body failed schema validation.',
      ajvDetails(validateCreateBody.errors)
    );
  }

  // Business rule: damageDate cannot be in the future.
  const damage = new Date(req.body.damageDate + 'T00:00:00Z');
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
  if (damage.getTime() > today.getTime()) {
    return sendError(
      res,
      422,
      'DAMAGE_DATE_IN_FUTURE',
      'damageDate cannot be in the future.'
    );
  }

  const now = nowIso();
  const claim = {
    id: crypto.randomUUID(),
    policyNumber: req.body.policyNumber,
    claimantName: req.body.claimantName,
    damageDate: req.body.damageDate,
    lossDescription: req.body.lossDescription,
    status: 'OPEN',
    createdAt: now,
    updatedAt: now,
  };
  claims.set(claim.id, claim);

  res.status(201)
    .location(`/claims/${claim.id}`)
    .json(claim);
});

// --- GET /claims/:id ---------------------------------------------------------

app.get('/claims/:id', (req, res) => {
  if (!UUID_V4.test(req.params.id)) {
    return sendError(res, 400, 'INVALID_ID', 'id must be a UUID v4.');
  }
  const claim = claims.get(req.params.id);
  if (!claim) return sendError(res, 404, 'CLAIM_NOT_FOUND', 'Claim does not exist.');
  res.json(claim);
});

// --- PATCH /claims/:id -------------------------------------------------------

app.patch('/claims/:id', (req, res) => {
  if (!UUID_V4.test(req.params.id)) {
    return sendError(res, 400, 'INVALID_ID', 'id must be a UUID v4.');
  }
  if (!requireObjectBody(req, res)) return;

  if (!validateUpdateBody(req.body)) {
    return sendError(
      res,
      400,
      'VALIDATION_ERROR',
      'Request body failed schema validation.',
      ajvDetails(validateUpdateBody.errors)
    );
  }

  const claim = claims.get(req.params.id);
  if (!claim) return sendError(res, 404, 'CLAIM_NOT_FOUND', 'Claim does not exist.');

  const { status, payoutAmount, payoutCurrency } = req.body;

  // Validate status transition.
  if (status !== undefined && status !== claim.status) {
    if (!canTransition(claim.status, status)) {
      return sendError(
        res,
        422,
        'INVALID_STATUS_TRANSITION',
        `Cannot transition ${claim.status} → ${status}. Allowed from ${claim.status}: ${
          (TRANSITIONS[claim.status] || []).join(', ') || 'none (terminal)'
        }.`
      );
    }
  }

  // Invariant: APPROVED and PAID require payoutAmount (either already on the
  // claim or supplied in this request).
  const nextStatus = status || claim.status;
  const nextPayout = payoutAmount !== undefined ? payoutAmount : claim.payoutAmount;
  if ((nextStatus === 'APPROVED' || nextStatus === 'PAID') && nextPayout === undefined) {
    return sendError(
      res,
      422,
      'PAYOUT_REQUIRED',
      `payoutAmount is required when status is ${nextStatus}.`
    );
  }

  // Apply.
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

app.use((req, res) => {
  sendError(res, 404, 'ROUTE_NOT_FOUND', `No handler for ${req.method} ${req.path}.`);
});

// --- Bootstrap ---------------------------------------------------------------

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`EMIL Claims mock listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, TRANSITIONS };
