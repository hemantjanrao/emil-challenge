# EMIL Claims API — QA Automation Take-Home

A minimal but **production-shaped** API-test project for an insurance claims
service. The OpenAPI spec is treated as the single source of truth; an
in-memory mock implements it faithfully (state machine + invariants) so the
test suite exercises real behaviour rather than tautologies.

> **Stack:** Playwright (API mode) · TypeScript · AJV · Express mock · GitHub Actions

---

## Quick start

```bash
npm install
npm test                 # starts the mock automatically and runs the suite
npm run test:report      # opens the HTML report from the last run
```

The Playwright suite starts an isolated mock on `http://localhost:3100`
by default (`MOCK_PORT=...` can override it), so stale local servers do not
hide contract changes.

Run the mock standalone (e.g. to hit it with curl):

```bash
npm run start            # → http://localhost:3000
curl -s localhost:3000/claims | jq
```

**Prereqs:** Node ≥ 20, npm ≥ 9.

---

## What's in the box

```
.
├── claims-api.yaml              # OpenAPI 3.0.3 — the source of truth
├── src/
│   ├── claims-mock-app.ts       # Express mock: state machine + AJV validation
│   └── mock-server.ts           # app.listen entry point
├── test-cases.md                # Human-readable test catalogue (TC-* ids)
├── playwright.config.ts         # Auto-starts mock; HTML + list reporters
├── tests/
│   ├── support/
│   │   ├── types.ts             # Typed domain models
│   │   ├── schema.ts            # AJV loaded from claims-api.yaml
│   │   ├── claim-builder.ts     # Parallel-safe test data factory
│   │   ├── claims-client.ts     # Reusable, typed API client
│   │   └── fixtures.ts          # Playwright test.extend + expectSchema
│   └── specs/
│       ├── create-claim.spec.ts         # POST happy path + negative matrix
│       ├── get-claim.spec.ts            # GET by id
│       ├── update-status.spec.ts        # State machine + invariants
│       └── list-claims.spec.ts          # List / filter
└── .github/workflows/tests.yml  # CI: install → test → upload report
```

---

## Challenge Deliverables

| PDF task | Where it is covered |
|----------|---------------------|
| Task 1: Design the Claims API in OpenAPI/Swagger | [`claims-api.yaml`](./claims-api.yaml) defines `POST /claims`, `GET /claims/{id}`, `PATCH /claims/{id}`, and `GET /claims`, including schemas, status enum, filters, and error responses. |
| Task 2: Derive test cases from the spec | [`test-cases.md`](./test-cases.md) lists happy paths, validation/negative tests, status-transition tests, and list/filter tests with TC IDs. |
| Task 3: Implement an API test framework | [`tests/specs/`](./tests/specs) contains Playwright API tests, [`tests/support/claims-client.ts`](./tests/support/claims-client.ts) provides the reusable API client, and [`tests/support/schema.ts`](./tests/support/schema.ts) exposes schema assertions. |
| Task 4: CI & docs | [`.github/workflows/tests.yml`](./.github/workflows/tests.yml) runs the suite in GitHub Actions, and this README explains setup, execution, scope cuts, and what else should be tested in a real service. |

---

## Architecture & design decisions

**Single source of truth.** `claims-api.yaml` is loaded at boot by both the
mock and the test suite. AJV compiles every `#/components/schemas/...` once
and validates responses in both directions — if the spec drifts from the
server, the schema assertions in the happy-path tests catch it immediately.

**Why not `json-server`?** The PDF explicitly names an invalid status
transition as a negative case. `json-server` can't express that. The
Express mock is ~200 lines and lets us model the real thing:

```
 OPEN ──► IN_REVIEW ──► APPROVED ──► PAID
              │
              └──► REJECTED
```

plus invariants (APPROVED/PAID require `payoutAmount`).

**Status code semantics.** `400` ≙ schema/syntax (missing field, wrong
type, malformed JSON). `404` ≙ resource not found. `422` ≙ business-rule
violation (invalid state transition, missing payout, payout before
approval, future `damageDate`). Every error body matches the shared
`Error` schema.

**Parallel-safe tests.** Every test generates a worker-safe `policyNumber`
via `claim-builder.ts`, so list / filter assertions stay deterministic even
though the mock is shared and Playwright runs files in parallel.

**Reusable client.** `ClaimsClient` wraps `APIRequestContext` with typed
methods per operation plus two helpers that matter at this size:
`createOrThrow` and `advanceThrough` — "arrange" primitives that fail
loudly and keep spec files readable.

**Coverage philosophy.** Create validation is data-driven (one loop, one row per constraint). Status transitions pick representative *patterns* — skip a step, go backwards, escape a terminal — rather than exhausting all 15 forbidden pairs. The goal is signal-to-noise: every test should be able to fail for a distinct reason.

---

## OpenAPI Spec

See [`claims-api.yaml`](./claims-api.yaml). At a glance:

| Method | Path              | Purpose                           |
|--------|-------------------|-----------------------------------|
| POST   | `/claims`         | Create (defaults to `OPEN`)       |
| GET    | `/claims`         | List; filter by `status`, `policyNumber` |
| GET    | `/claims/{id}`    | Read a single claim               |
| PATCH  | `/claims/{id}`    | Advance status (state machine) / set payout |

`Claim` shape: `id`, `policyNumber`, `claimantName`, `damageDate`,
`lossDescription`, `status`, optional `payoutAmount` + `payoutCurrency`,
`createdAt`, `updatedAt`. `POST /claims` accepts `status=OPEN` explicitly
or defaults it when omitted; other statuses are reached via `PATCH`.

---

## Test catalogue

See [`test-cases.md`](./test-cases.md) for the full catalogue (C1–C9, G1–G3, U1–U9, L1–L6) — 41 tests total. Each TC ID maps directly to a `test('TC-…')` in the suite.

---

## CI

[`.github/workflows/tests.yml`](./.github/workflows/tests.yml) runs on push
and pull request to `main`:

1. Checkout, set up Node 20 with npm cache.
2. `npm ci`.
3. `npm test` (Playwright starts the mock automatically).
4. Uploads the HTML report as `playwright-report` on both pass *and* fail
   so reviewers can inspect any failure without re-running locally.

---

## Scope I deliberately cut

> The PDF says: *"We value direction over completeness. If you cut the
> scope, document it."*

- **No real auth.** The mock is wide-open; auth is enumerated below as
  part of what I'd test in a real service.
- **No OpenAPI linting in CI** (`spectral` / `redocly`). Worth adding but
  one more tool for a reviewer to install — happy to add in a follow-up.
- **No contract tests** against a generated client. With a small, stable
  spec, AJV-based response validation hits the 80/20 sweet spot.
- **No persistence.** The mock is in-memory on purpose so every CI run
  starts clean; in real life we'd wire tests to a disposable DB or
  transactional fixtures.
- **No DELETE /claims.** Not in the PDF scope. In a real service it would likely be a soft-delete (status → `WITHDRAWN`) rather than a hard delete, which would itself need transition tests.
- **Single happy currency / payout model.** No FX, no partial payments.

---

## What else I'd test in a real EMIL claims service

The take-home asks for this explicitly. A non-exhaustive priority list:

### Authentication & authorisation
- Unauthenticated request → `401`, expired / malformed token → `401`.
- Role-based access: claim-handler can move `OPEN → IN_REVIEW`; only
  approver role can `APPROVED → PAID`; read-only role cannot PATCH.
- Tenancy isolation: a user from tenant A cannot fetch or list a claim
  from tenant B, even with a valid id (no IDOR leaks via `GET` or
  `PATCH`; `404` *not* `403` to avoid existence-probing).
- Audit trail: every state transition captures actor + timestamp and is
  retrievable for compliance.

### Idempotency & duplicates
- `POST /claims` with an `Idempotency-Key` header: same key + same body ⇒
  same resource; same key + different body ⇒ `409` or `422`.
- PATCH with the same target status twice (once legal, once from a
  terminal state) — confirm the terminal case is a no-op / `422`, not a
  silent success.

### Concurrency / race conditions
- Two approvers PATCH the same claim from `IN_REVIEW` to different
  terminal states simultaneously (`APPROVED` vs `REJECTED`). Expect
  optimistic locking via `If-Match` / `ETag` or a DB-level guard — one
  wins, the loser gets `409 CONFLICT`.
- Concurrent `POST` of the same claim under a duplicate
  `Idempotency-Key` returns the *same* claim, not two.

### Data consistency & invariants
- Currency + amount consistency on `PAID` (no EUR claim paid in USD).
- `createdAt ≤ updatedAt` always; `updatedAt` monotonically non-decreasing.
- Cross-field: `damageDate` must be within the policy's active period.

### Input robustness
- Oversized bodies (claim with 10 MB `lossDescription`) → `413`.
- Unicode & RTL names; emoji in `claimantName`.
- SQL injection / NoSQL injection payloads in free-text fields.
- Date edge cases: leap day, timezone boundaries, DST.

### Observability & operational
- Structured logs include `claimId`, actor, transition — never PII
  verbatim.
- Metrics: claims-created rate, avg time-in-state per status, rejection
  ratio.
- Error responses include a `traceId` so support can correlate with APM.

### Performance & limits
- `GET /claims` with thousands of rows — response time and memory under load.
  A real service would need `limit`/`offset` or cursor pagination; `GET /claims`
  currently returns unbounded results.
- P95 latency under a realistic claim submission rate.
- Rate limiting: `429` with a `Retry-After` header on burst traffic.

### Contract stability
- Old clients with unknown new fields still parse responses
  (backwards-compatible additions only; breaking changes go behind a
  new `v2/` prefix).
- Consumer-driven contract tests (Pact) with the downstream payouts
  service so the accounting team doesn't break on a silent rename.

### Domain-specific
- Partial payments: `APPROVED → PARTIALLY_PAID → PAID`.
- Reopens from `REJECTED` (only by supervisor role, within an SLA).
- Fraud-scoring webhook integration (on create).
- Document uploads (`multipart/form-data`) linked to a claim, virus-
  scanned before download.

---

## A note on craft

The tests are intentionally lean — 41 in total, each with one reason to fail.
The investment went into state-machine invariants and input-validation coverage
because those are where real bugs hide in a claims service, not into padding
the count with redundant assertions.
