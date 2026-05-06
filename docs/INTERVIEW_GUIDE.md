# EMIL Claims Framework - Interview Guide

This guide is designed for interview preparation: what the framework is, why it is structured this way, how requests flow through it, how tests enforce quality, and how to explain trade-offs confidently.

## 1) What This Framework Is

This repository is an API testing framework around an insurance-claims domain. It includes:

- A contract-first API definition (`claims-api.yaml`)
- A behavior-rich in-memory mock API (`src/claims-mock-app.ts`)
- A reusable Playwright API test framework (`tests/support/*`)
- Endpoint-level test specs (`tests/specs/*`)
- CI automation (`.github/workflows/tests.yml`)
- Optional interactive docs server (`src/swagger-server.ts`)

The strongest interview statement:

- The OpenAPI file is the source of truth.
- Both runtime validation and test assertions derive from that same contract.
- The test framework focuses on business behavior (state transitions and invariants), not only status codes.

## 2) Architecture (Contract -> Runtime -> Tests)

Core dependency graph:

1. `claims-api.yaml` defines schemas, enums, parameters, and responses.
2. `lib/openapi.ts` loads YAML, registers schemas in AJV, and exports validators.
3. `src/claims-mock-app.ts` uses those validators to enforce request contracts.
4. `tests/support/schema.ts` and `tests/support/fixtures.ts` reuse the same validators for response assertions.
5. `playwright.config.ts` auto-starts the mock server so test execution is one command.

Why this matters:

- Contract drift becomes hard to hide.
- Server and tests evolve from one schema source.
- Failures are more meaningful (schema mismatch vs brittle hand-written checks).

## 3) Runtime Request Lifecycle

Example: `PATCH /claims/{id}`

1. Request enters Express app (`src/claims-mock-app.ts`).
2. Middleware executes:
   - CORS
   - `express.json()`
   - malformed JSON remapped to framework error shape (`INVALID_JSON`)
3. Path id format validated (UUID v4).
4. Body validated against `UpdateClaimRequest` AJV schema.
5. Claim looked up in in-memory `Map<string, Claim>`.
6. Business rules evaluated:
   - allowed state transition (`TRANSITIONS`)
   - payout only when status is `APPROVED` or `PAID`
   - payout required for `APPROVED` and `PAID`
7. Claim mutated, `updatedAt` advanced, response returned.
8. Unknown routes fall through to standardized `ROUTE_NOT_FOUND`.

Status-code semantics used intentionally:

- `400` malformed/invalid input (schema or syntax)
- `404` missing resource
- `422` business-rule violation

## 4) Domain Model and State Machine

Primary domain type: `Claim`

Key fields:

- identity: `id`, `policyNumber`
- claimant data: `claimantName`, `lossDescription`, `damageDate`
- lifecycle: `status`
- payout: `payoutAmount`, `payoutCurrency`
- audit timestamps: `createdAt`, `updatedAt`

Allowed transitions:

- `OPEN -> IN_REVIEW`
- `IN_REVIEW -> APPROVED | REJECTED`
- `APPROVED -> PAID`
- `REJECTED`, `PAID` are terminal

Interview talking point:

The transition table is encoded as `Record<ClaimStatus, ClaimStatus[]>`, which gives compile-time exhaustiveness pressure when statuses evolve.

## 5) Validation Strategy

Validation has two layers:

1. Schema layer (AJV + OpenAPI)
   - required fields, formats, patterns, enum values, unknown field rejection
2. Business layer (manual rules in route handlers)
   - future damage date
   - legal status transitions
   - payout timing and completeness

This split is interview-friendly because it clarifies which failures are declarative-contract failures vs domain-rule failures.

## 6) Test Framework Design

### Test stack

- Runner: Playwright API mode (`@playwright/test`)
- HTTP abstraction: `ClaimsClient`
- Fixtures: custom `claims` fixture in `tests/support/fixtures.ts`
- Data factory: `aValidCreateClaim()` in `tests/support/claim-builder.ts`
- Schema assertions: `expectSchema(validators.X, payload)`

### Why `ClaimsClient` matters

`ClaimsClient` centralizes:

- endpoint paths
- typed request methods
- arrange helpers (`createOrThrow`, `advanceThrough`)

This prevents copy-paste setup code across specs and keeps tests readable.

### Why data factory matters

`aValidCreateClaim()` creates valid-by-default payloads and supports safe overrides for negative cases. It also produces worker-unique `policyNumber`s to keep parallel execution deterministic.

## 7) Test Coverage Map

Specs are operation-centric:

- `create-claim.spec.ts`: create happy path + validation matrix
- `get-claim.spec.ts`: fetch existing / unknown / invalid id
- `update-status.spec.ts`: full workflow, terminal rules, payout invariants
- `list-claims.spec.ts`: list + status/policy filters + invalid query params

Important design choice:

Transition negative tests focus on representative invalid patterns instead of brute-force pair explosion, improving signal-to-noise while still protecting key invariants.

## 8) Tooling and Execution

Main scripts (`package.json`):

- `npm run start` - run mock server
- `npm test` - run Playwright suite
- `npm run test:report` - open HTML report
- `npm run lint` - lint checks
- `npm run typecheck` - TypeScript checks
- `npm run test:server` - run tests against externally running server

Playwright config highlights (`playwright.config.ts`):

- auto web server startup unless `BASE_URL` is provided
- full parallel mode
- CI retries and worker control
- traces retained on failure

CI (`.github/workflows/tests.yml`):

- install with `npm ci`
- run tests on pushes/PRs to `main`
- upload HTML report always and traces on failures

## 9) Swagger and Developer Experience

- `src/swagger.ts` provides `SwaggerDocs.setup(...)`.
- `src/swagger-server.ts` starts a docs server on port `3001`.
- This is separate from the mock API process and is useful for manual endpoint exploration.

## 10) Strengths, Limitations, and Improvement Ideas

### Strengths

- Contract-driven architecture with shared validators
- Clear error taxonomy (`400/404/422`)
- Business rules represented explicitly (state machine + payout invariants)
- Fast, deterministic API tests with reusable framework primitives

### Current limitations

- In-memory persistence only
- No authn/authz layer
- No pagination in list endpoint
- No concurrency controls (ETag/versioning)

### Logical next improvements

- add auth and tenancy model tests
- add idempotency and race-condition coverage
- add contract linting (`spectral`) in CI
- introduce persistent test environment option (containerized DB)

## 11) Interview Walkthrough (Suggested Order)

Use this order when screen-sharing:

1. `claims-api.yaml` - show contract and schemas first.
2. `lib/openapi.ts` - explain shared validator compilation.
3. `src/claims-mock-app.ts` - show request handling + business rules.
4. `tests/support/claims-client.ts` + `fixtures.ts` - explain framework reuse.
5. `tests/specs/update-status.spec.ts` - show business-critical tests.
6. `playwright.config.ts` - explain execution model.
7. `.github/workflows/tests.yml` - explain CI confidence loop.

If time is short, spend most time on steps 2-5; that demonstrates architecture, quality engineering judgment, and maintainability.

## 12) High-Value Interview Q&A Prep

### "Why Playwright for API tests?"

- Strong parallel test runner, fixture model, traces, and webServer lifecycle in one tool.
- Reduces glue code compared to assembling multiple libraries.

### "How do you prevent contract drift?"

- Single OpenAPI source loaded by both server validation and test assertions through `lib/openapi.ts`.

### "How do you separate syntax errors from domain errors?"

- Schema/syntax issues return `400`; domain rule violations return `422`; missing resources return `404`.

### "How is test flakiness controlled?"

- deterministic data factory, typed client abstraction, fixture injection, and isolated mock startup per test run.

### "What would you harden first in production?"

- authz/tenancy, idempotency, optimistic locking, and observability (trace IDs, metrics, structured logs).

## 13) 60-Minute Study Plan

- 0-10 min: read `claims-api.yaml` and state model.
- 10-20 min: read `lib/openapi.ts`.
- 20-35 min: read `src/claims-mock-app.ts` flow and error handling.
- 35-45 min: read `tests/support/*` framework abstractions.
- 45-55 min: read `tests/specs/update-status.spec.ts`.
- 55-60 min: review CI config and summarize strengths/trade-offs aloud.

Use this guide plus `CODEBASE_GUIDE.md` for deep technical detail and `test-cases.md` for scenario-level coverage mapping.
