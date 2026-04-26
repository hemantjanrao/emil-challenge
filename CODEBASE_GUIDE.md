# EMIL Claims API — Codebase Guide

A complete walkthrough of every file, every technology, and every design decision in this project. Written so someone who didn't write the code can understand it end-to-end.

---

## Table of Contents

1. [What This Project Does](#1-what-this-project-does)
2. [How the Pieces Fit Together](#2-how-the-pieces-fit-together)
3. [File Map](#3-file-map)
4. [Technology Deep Dives](#4-technology-deep-dives)
   - [OpenAPI 3.0](#41-openapi-30)
   - [TypeScript](#42-typescript)
   - [AJV (Another JSON Validator)](#43-ajv-another-json-validator)
   - [Express.js](#44-expressjs)
   - [tsx](#45-tsx)
   - [Playwright](#46-playwright)
   - [ESLint](#47-eslint)
   - [GitHub Actions CI](#48-github-actions-ci)
   - [ESM (ECMAScript Modules)](#49-esm-ecmascript-modules)
5. [File-by-File Walkthroughs](#5-file-by-file-walkthroughs)
6. [Data Flow: Request Lifecycle](#6-data-flow-request-lifecycle)
7. [Key Patterns Explained](#7-key-patterns-explained)
8. [Running and Debugging](#8-running-and-debugging)
9. [Extending the Suite](#9-extending-the-suite)

---

## 1. What This Project Does

This project is a complete take-home QA automation challenge implementation for a Senior QA Automation Engineer role. It contains four deliverables:

| Deliverable | What it is |
|---|---|
| `claims-api.yaml` | An OpenAPI 3.0 specification defining the API contract |
| `test-cases.md` | 41 test cases derived from the spec in Markdown |
| `tests/specs/*.spec.ts` | Automated API tests using Playwright |
| `.github/workflows/tests.yml` | GitHub Actions CI pipeline |

The tests run against an in-memory mock server (`src/claims-mock-app.ts`) that implements the Claims API locally — no real backend required.

### What is the Claims API?

The API manages insurance claims with a lifecycle:

```
POST /claims              → Create a new claim (status starts as OPEN)
GET  /claims              → List all claims (filterable by status, policyNumber)
GET  /claims/{id}         → Fetch one claim by UUID
PATCH /claims/{id}        → Update a claim's status and/or payout
```

Claims move through a **state machine**:
```
OPEN ──► IN_REVIEW ──► APPROVED ──► PAID
               │
               └──► REJECTED
```

---

## 2. How the Pieces Fit Together

```
claims-api.yaml          ← the single source of truth for the API shape
       │
       ▼
lib/openapi.ts           ← loads the YAML, compiles AJV validators once
       │                    exported as: spec, validators, getSchemaValidator
       ├────────────────────────────────────────────┐
       ▼                                            ▼
src/claims-mock-app.ts   ← Express HTTP server    tests/support/schema.ts
   uses validators to        validates requests       re-exports validators
   validate request bodies                            for test assertions
       │
       ▼
src/mock-server.ts       ← calls app.listen()
       │                    started by Playwright's webServer
       ▼
tests/specs/*.spec.ts    ← Playwright API tests
   uses fixtures.ts → claims-client.ts → Playwright request context
```

**The key insight**: `lib/openapi.ts` is the bridge. It loads `claims-api.yaml` once and gives the same compiled validators to both the mock server (to reject bad requests) and the test suite (to assert correct responses). If the spec changes, both sides automatically pick up the change.

---

## 3. File Map

```
HHHHH/
├── claims-api.yaml              # OpenAPI 3.0 spec — API contract
├── test-cases.md                # 41 test cases in Markdown
├── README.md                    # Quick start + project overview
├── CODEBASE_GUIDE.md            # (this file) deep technical walkthrough
│
├── lib/                         # Shared code — used by both mock AND tests
│   ├── types.ts                 # TypeScript interfaces (Claim, ClaimStatus, etc.)
│   └── openapi.ts               # YAML loader + AJV validator factory
│
├── src/                         # Mock server code
│   ├── claims-mock-app.ts       # Express app with all routes and business logic
│   └── mock-server.ts           # Thin entry point — calls app.listen()
│
├── tests/
│   ├── specs/                   # Playwright test files (one per API operation)
│   │   ├── create-claim.spec.ts # POST /claims (TC-C1–C9)
│   │   ├── get-claim.spec.ts    # GET /claims/{id} (TC-G1–G3)
│   │   ├── update-status.spec.ts# PATCH /claims/{id} (TC-U1–U9)
│   │   └── list-claims.spec.ts  # GET /claims (TC-L1–L6)
│   └── support/                 # Test infrastructure (not test cases)
│       ├── fixtures.ts          # Playwright fixture wiring + expectSchema helper
│       ├── claims-client.ts     # Typed HTTP client wrapping Playwright's request
│       ├── claim-builder.ts     # Test data factory (aValidCreateClaim)
│       ├── schema.ts            # Re-exports validators + formatErrors helper
│       └── types.ts             # Re-exports lib/types.ts for short imports
│
├── playwright.config.ts         # Playwright configuration (ports, reporters, etc.)
├── tsconfig.json                # TypeScript compiler options
├── eslint.config.js             # ESLint 9 flat config
├── package.json                 # Dependencies + npm scripts
└── .github/
    └── workflows/
        └── tests.yml            # CI pipeline definition
```

---

## 4. Technology Deep Dives

### 4.1 OpenAPI 3.0

**What it is**: A specification format (written in YAML or JSON) for describing REST APIs. It documents every endpoint, every request/response shape, every error code, and every validation rule in a machine-readable way.

**Why we use it**: Instead of describing the API in prose (which becomes stale), the YAML file is the contract. Both the mock server and the tests read from it directly via `lib/openapi.ts`, so the spec and implementation cannot drift apart.

**Key concepts in `claims-api.yaml`**:

```yaml
components:
  schemas:
    Claim:                        # Reusable schema component
      type: object
      required: [id, policyNumber, ...]
      additionalProperties: false # Extra fields are rejected (strict)
      properties:
        id:
          type: string
          format: uuid            # AJV validates this is a real UUID
        policyNumber:
          type: string
          pattern: '^POL-[0-9]{4,10}$'  # Regex constraint
        status:
          $ref: '#/components/schemas/ClaimStatus'  # Reference to another schema
```

**`$ref`** — Instead of duplicating the `Claim` schema everywhere it's used, OpenAPI lets you reference it with `$ref`. AJV resolves these references automatically when validating.

**`additionalProperties: false`** — If a client sends a field not in the schema (e.g. `id` on a create request), it's rejected with 400. This prevents clients from accidentally relying on server-ignored fields.

**`format: date` / `format: uuid`** — The base JSON Schema spec defines these format names but doesn't enforce them. The `ajv-formats` package adds the enforcement.

---

### 4.2 TypeScript

**What it is**: A superset of JavaScript that adds static type checking. TypeScript code is erased to plain JavaScript at runtime — the types only exist at compile time.

**Why we use it**: Every function parameter, return type, and interface field is checked by the TypeScript compiler before any code runs. Typos in field names, passing the wrong type, or forgetting to handle undefined all become compile errors instead of runtime surprises.

**Key compiler settings in `tsconfig.json`**:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",           // Compile to modern JS (async/await, etc.)
    "module": "Preserve",         // Keep import/export as-is (ESM in, ESM out)
    "moduleResolution": "Bundler",// Resolve imports like a modern bundler would
    "strict": true,               // Enable all strict checks (null safety, etc.)
    "noUncheckedIndexedAccess": true, // array[i] returns T|undefined, not T
    "verbatimModuleSyntax": true, // `import type` must be used for type-only imports
    "noEmit": true                // Just check types; tsx handles the actual running
  }
}
```

**`noUncheckedIndexedAccess`**: When you write `array[0]`, TypeScript normally assumes the result is `T` (not undefined). With this flag enabled, `array[0]` returns `T | undefined`, forcing you to handle the "index out of bounds" case. This prevents a whole class of runtime errors.

**`verbatimModuleSyntax`**: Forces you to use `import type { Foo }` for type-only imports. This helps tools that need to distinguish value imports from type imports (like tsx, which erases types without full compilation).

---

### 4.3 AJV (Another JSON Validator)

**What it is**: A JSON Schema validation library that compiles schemas into optimized validator functions. It's the fastest JSON Schema validator available for Node.js.

**Why we use it**: The OpenAPI spec already defines all the validation rules (required fields, string patterns, formats, enums). Rather than re-implementing those rules manually in the mock server, we load the spec and compile it into validator functions. One source of truth.

**How it works** (in `lib/openapi.ts`):

```typescript
// Step 1: Create the AJV instance with options
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv); // add support for date, uuid, email, etc.

// Step 2: Register all component schemas
// This teaches AJV what '#/components/schemas/Claim' means when it sees a $ref
for (const [name, schema] of Object.entries(spec.components.schemas)) {
  ajv.addSchema(schema as object, `#/components/schemas/${name}`);
}

// Step 3: Compile a validator for a specific schema
const validateClaim = ajv.getSchema('#/components/schemas/Claim');
// `validateClaim` is now a function: (value: unknown) => boolean
// After a failing call, `validateClaim.errors` contains the error details

// Step 4: Use it
const isValid = validateClaim(someObject);
if (!isValid) {
  console.log(validateClaim.errors); // [{ instancePath: '/status', message: '...' }]
}
```

**`allErrors: true`**: Without this, AJV stops at the first error. With it, AJV collects all errors in one pass — much better UX when a request is missing 3 fields.

**`e.instancePath`**: The path to the offending value using JSON Pointer notation. For a top-level missing field, this is `''` (empty string). For `/policyNumber`, it means the `policyNumber` field was invalid.

---

### 4.4 Express.js

**What it is**: A minimal web framework for Node.js. It handles the mechanics of reading HTTP requests and writing responses so you can focus on the actual business logic.

**Why we use it**: The mock server needs to listen on a port, parse JSON bodies, and match URL patterns to handlers. Express handles all of that in a few lines.

**Key concepts used in `src/claims-mock-app.ts`**:

```typescript
const app = express();

// Middleware: runs for every request before route handlers
app.use(express.json());  // parses the JSON body into req.body

// Route handler: runs when method + path match
app.post('/claims', (req, res) => {
  const body = req.body;    // the parsed JSON object
  res.status(201).json(claim); // send a 201 response with JSON body
});

// Path parameter: :id becomes req.params.id
app.get('/claims/:id', (req, res) => {
  const id = req.params['id']; // e.g. '550e8400-e29b-41d4-a716-446655440000'
});

// Error handler: 4-parameter signature means Express treats it specially
app.use((err, req, res, next) => { ... });

// 404 fallback: registered last, catches anything that didn't match above
app.use((req, res) => {
  res.status(404).json({ code: 'ROUTE_NOT_FOUND', message: '...' });
});
```

**Why `app` is exported but `app.listen()` is in a separate file**: 
`app` is the routing logic; `app.listen()` is what binds it to a network port. Separating them means:
- Playwright can import `app` and start it with a test-specific port.
- Unit tests could import `app` and call routes directly without binding a port.
- The two concerns stay decoupled.

---

### 4.5 tsx

**What it is**: A command-line tool that runs TypeScript files directly using Node.js, without a separate compilation step.

**Why we use it**: Instead of:
1. Compile TypeScript → JavaScript (creates `dist/` files)
2. Run the compiled JavaScript

We just do:
```
npx tsx src/mock-server.ts
```

tsx handles the compilation on the fly (using esbuild internally). This is perfect for a mock server that only needs to run during tests — no build artifacts to manage.

**In `playwright.config.ts`**:
```typescript
webServer: {
  command: `PORT=${mockPort} npx tsx src/mock-server.ts`,
  // ...
}
```
Playwright runs this command to start the mock before tests begin.

---

### 4.6 Playwright

**What it is**: A browser automation framework (from Microsoft) that also includes a powerful API testing mode. In this project, we only use the API testing features — no browsers are launched.

**Why we use it for API tests (instead of Jest + axios, etc.)**:
- Built-in HTTP client (`APIRequestContext`) with base URL, default headers, and trace capture.
- Parallel worker architecture — spec files run concurrently across OS processes.
- Fixtures system — dependency injection for test setup/teardown.
- `webServer` block — auto-starts and stops the mock server around the test run.
- Trace viewer — records HTTP traffic for failed tests for post-mortem debugging.
- HTML reporter — generates a browsable test report automatically.

**How the fixture system works**:

```typescript
// fixtures.ts: define the fixture
const test = base.extend<{ claims: ClaimsClient }>({
  claims: async ({ request }, use) => {
    //               ↑ built-in Playwright fixture (APIRequestContext)
    await use(new ClaimsClient(request));
    //      ↑ hand the fixture value to the test
    // after `use` returns, the test is done — clean up here if needed
  },
});

// spec file: use the fixture
test('creates a claim', async ({ claims }) => {
  //                             ↑ Playwright injects the ClaimsClient here
  const res = await claims.create(payload);
});
```

**How `APIRequestContext` works**:
- It picks up `baseURL` from `playwright.config.ts` automatically.
- Every `get('/claims')` call becomes `http://localhost:3100/claims`.
- It returns `APIResponse` objects with `.status()`, `.json()`, `.text()`.

---

### 4.7 ESLint

**What it is**: A JavaScript/TypeScript linter — a tool that finds code problems (bugs, style issues, anti-patterns) without running the code.

**Why we use it**: Catches common mistakes TypeScript's type system doesn't catch. The key rule in this project:

```javascript
// eslint.config.js
'@typescript-eslint/no-floating-promises': 'error'
```

This rule errors if you call an `async` function and don't `await` it:

```typescript
// BAD — test will pass even if this throws, because nobody awaits it:
claims.create(payload); // ← ESLint error: floating promise

// GOOD:
await claims.create(payload);
```

Floating promises are a common source of flaky tests — the test function returns before the async operation completes, so assertions may run on stale data.

**ESLint 9 "flat config"**: The `eslint.config.js` format (instead of `.eslintrc.json`) is ESLint's newer config format that uses plain JavaScript objects instead of a special configuration DSL.

---

### 4.8 GitHub Actions CI

**What it is**: A CI/CD (Continuous Integration/Continuous Deployment) platform built into GitHub. Workflows are YAML files in `.github/workflows/` that run automatically on push, pull request, or manually.

**What our workflow does** (`.github/workflows/tests.yml`):

```yaml
on:
  push:          # Run on every push to any branch
  pull_request:  # Run on every PR
  workflow_dispatch: # Allow manual trigger from the GitHub UI

concurrency:
  group: tests-${{ github.ref }}
  cancel-in-progress: true  # If you push again, cancel the previous run
```

Steps:
1. `npm ci` — install exact dependency versions from `package-lock.json`
2. `npx playwright install --with-deps chromium` — install Playwright's test dependencies
3. `npm test` — run the full Playwright suite
4. Upload the HTML report as an artifact (always, so you can download it)
5. Upload Playwright traces as an artifact (only on failure, for debugging)

**Why `npm ci` instead of `npm install`?**: `npm ci` uses the exact locked versions and is faster in CI. `npm install` can update the lockfile.

---

### 4.9 ESM (ECMAScript Modules)

**What it is**: The standard JavaScript module system, using `import`/`export` syntax. The older system (CommonJS, or CJS) uses `require()`/`module.exports`.

**Why it matters here**: `package.json` has `"type": "module"`, which means all `.js` and `.ts` files in this project use ESM by default.

**The `.js` extension rule**: In ESM, relative imports must include the file extension:
```typescript
import { Claim } from './types.js';  // CORRECT (even though file is types.ts)
import { Claim } from './types';     // WRONG in ESM — Node.js will fail at runtime
```
The `.js` extension is used even for `.ts` files because TypeScript compiles `.ts` → `.js`, and Node.js resolves `.js`.

**`__dirname` doesn't exist in ESM**:
CommonJS provides `__dirname` (current directory) automatically. ESM does not. Instead:
```typescript
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// import.meta.url is the URL of the current module file
const __dirname = dirname(fileURLToPath(import.meta.url));
```
This is the standard pattern for getting the current directory in ESM.

---

## 5. File-by-File Walkthroughs

### `claims-api.yaml` — The API Contract

This is the most important file in the project. Everything else derives from it.

**Structure**:
```yaml
openapi: 3.0.3
info: ...               # API name and version

servers:
  - url: http://localhost:3100   # Default test server (listed first for Playwright)
  - url: http://localhost:3000   # Standalone manual server

paths:
  /claims:
    get: ...            # GET /claims
    post: ...           # POST /claims
  /claims/{id}:
    get: ...            # GET /claims/{id}
    patch: ...          # PATCH /claims/{id}

components:
  schemas:
    Claim: ...          # Response shape
    CreateClaimRequest: # POST body shape
    UpdateClaimRequest: # PATCH body shape
    ClaimStatus: ...    # Enum: OPEN|IN_REVIEW|APPROVED|REJECTED|PAID
    Error: ...          # Error envelope: { code, message, details? }
```

**Key validation constraints**:
- `policyNumber`: must match `^POL-[0-9]{4,10}$`
- `claimantName`: minimum 2 characters
- `damageDate`: ISO 8601 date format (`YYYY-MM-DD`)
- `lossDescription`: minimum 10 characters
- `payoutAmount`: number (positive implied by test data)
- `status` on create: only `OPEN` is allowed
- `additionalProperties: false` on all request bodies

---

### `lib/types.ts` — TypeScript Domain Types

Pure TypeScript — no imports, no runtime behaviour. Just type definitions.

Every interface here has a 1:1 correspondence with a schema in `claims-api.yaml`. The TypeScript compiler uses these at compile time; AJV uses the YAML at runtime. They say the same thing in different languages.

Key types:
- `ClaimStatus` — union type encoding the 5 lifecycle states
- `Claim` — the full response object (all fields optional except id/policyNumber/etc.)
- `CreateClaimRequest` — what POST /claims accepts (`status?: 'OPEN'` is the only optional field)
- `UpdateClaimRequest` — what PATCH /claims/{id} accepts
- `ErrorResponse` — the error envelope shape

---

### `lib/openapi.ts` — Shared Validator Factory

Loads `claims-api.yaml` once and compiles AJV validators. Both the mock server and the test suite import from this file.

**The startup sequence**:
1. `readFileSync(specPath)` — read the YAML file synchronously at module load time
2. `yaml.parse(...)` — parse YAML text into a JavaScript object
3. `new Ajv(...)` + `addFormats(ajv)` — create the AJV instance with format support
4. `ajv.addSchema(...)` × N — register every component schema so `$ref` resolves
5. Export `validators` — the pre-compiled validator functions ready to call

Why synchronous file read? This module is loaded once at startup, not during a request. Synchronous I/O at startup is fine and keeps the code simple.

---

### `src/claims-mock-app.ts` — The Mock Server

The heart of the project. Implements all 4 API routes with:
- Schema validation (using AJV compiled validators from lib/openapi.ts)
- Business rule validation (state machine, payout invariants, future date check)
- In-memory storage (a `Map<id, Claim>`)
- Consistent error response format matching the `Error` schema

**Request processing order for PATCH /claims/{id}**:
1. Validate `id` format (UUID v4) → 400 if invalid
2. Validate request body against `UpdateClaimRequest` schema → 400 if invalid
3. Look up claim in Map → 404 if not found
4. Check state machine allows the transition → 422 if forbidden
5. Check payout invariants → 422 if violated
6. Apply changes → 200 with updated claim

This ordering matters: always validate format before business logic, always check existence before applying rules.

---

### `src/mock-server.ts` — Server Entry Point

Only 10 lines. Imports `app` from `claims-mock-app.ts`, reads `PORT` from environment, calls `app.listen()`, and logs the startup banner.

The separation means `app` can be imported by Playwright without starting a server, and also started on a custom port without changing the app code.

---

### `playwright.config.ts` — Test Runner Configuration

Controls:
- **Where tests live** (`testDir`)
- **Parallelism** (`fullyParallel: true`, `workers: 2` in CI)
- **Retries** (1 in CI, 0 locally)
- **Reporters** (list + HTML always; GitHub annotations in CI)
- **Base URL** (defaults to `http://localhost:3100`, overridable via `BASE_URL`)
- **webServer block** (starts the mock, waits until it responds, stops it after)
- **Traces** (`retain-on-failure` — save HTTP traces for debugging failures)

---

### `tests/support/fixtures.ts` — Fixture Wiring

Extends Playwright's `test` with a `claims` fixture that automatically creates a `ClaimsClient` for each test. Specs destructure `{ claims }` without knowing how it's constructed.

Also exports `expectSchema` — the assertion helper that calls an AJV validator and throws a descriptive error with the full offending body if validation fails.

---

### `tests/support/claims-client.ts` — Typed HTTP Client

Wraps Playwright's `APIRequestContext` (which accepts raw strings and `unknown` bodies) with a TypeScript API where:
- Method signatures are typed (`create(body: Partial<CreateClaimRequest>)`)
- URLs are centralized (change `/claims` in one place)
- `createOrThrow` and `advanceThrough` are "arrange" helpers — they throw immediately on unexpected responses so test failures point to the actual assertion, not a setup step

---

### `tests/support/claim-builder.ts` — Test Data Factory

`aValidCreateClaim(overrides?)` generates a valid `CreateClaimRequest` payload with a unique `policyNumber`. Unique means unique across Playwright worker processes (encoded using `process.pid`), so parallel workers don't interfere with each other's list queries.

Pattern:
```
policyNumber = POL-WWWWWLLLLL
                    ↑↑↑↑↑↑↑↑↑↑
                    │└── 5-digit per-call counter within this worker
                    └─── 5 digits of process.pid (unique per worker)
```

---

### `tests/specs/*.spec.ts` — The Tests

Each spec file covers one API operation:

| File | Operation | Tests |
|---|---|---|
| `create-claim.spec.ts` | POST /claims | TC-C1–C9 (20 tests inc. data-driven loops) |
| `get-claim.spec.ts` | GET /claims/{id} | TC-G1–G3 (3 tests) |
| `update-status.spec.ts` | PATCH /claims/{id} | TC-U1–U9 (12 tests) |
| `list-claims.spec.ts` | GET /claims | TC-L1–L6 (6 tests) |

All tests follow the **Arrange / Act / Assert** pattern:
```typescript
test('TC-G1 returns 200 for existing claim', async ({ claims }) => {
  // Arrange — create a claim so we have a real id
  const created = await claims.createOrThrow(aValidCreateClaim());

  // Act — call the endpoint under test
  const res = await claims.get(created.id);

  // Assert — check the response
  expect(res.status()).toBe(200);
  expectSchema(validators.Claim, await res.json());
});
```

---

## 6. Data Flow: Request Lifecycle

Here's what happens when a test runs `POST /claims`:

```
Test                   ClaimsClient         Playwright              Mock Server
─────                  ────────────         ─────────               ───────────
claims.create(payload)
  │
  └─► request.post('/claims', { data: payload })
                           │
                           └─► HTTP POST http://localhost:3100/claims
                                                                │
                                                   express.json() parses body
                                                                │
                                                   jsonParseErrorHandler checks
                                                   for malformed JSON
                                                                │
                                                   POST /claims handler runs:
                                                     1. requireObjectBody check
                                                     2. validateCreateBody(req.body)
                                                        (AJV checks schema)
                                                     3. damageDate future check
                                                     4. claim = { id: randomUUID(), ... }
                                                     5. claims.set(claim.id, claim)
                                                     6. res.status(201).json(claim)
                           │
                           ◄─── HTTP 201 { id, policyNumber, status: 'OPEN', ... }
                           │
  ◄─── APIResponse
  │
const body = await res.json()    // { id: '...', status: 'OPEN', ... }
expectSchema(validators.Claim, body) // AJV validates the response shape
```

---

## 7. Key Patterns Explained

### State Machine as a Lookup Table

Instead of a chain of if/else statements, the allowed transitions are encoded as a `Record`:

```typescript
const TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  OPEN:      ['IN_REVIEW'],
  IN_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED:  ['PAID'],
  REJECTED:  [],    // terminal — empty array means no transitions allowed
  PAID:      [],    // terminal
};
```

**Why `Record<ClaimStatus, ...>`?** TypeScript enforces that every status has an entry. If you add `'CANCELLED'` to `ClaimStatus`, TypeScript will error here until you add `CANCELLED: [...]` to the transitions map. This is called **exhaustiveness checking** — the type system makes silent omissions impossible.

Checking a transition:
```typescript
function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
```

### Data-Driven Tests

For negative test cases (TC-C5, TC-C6), instead of writing 13 nearly identical functions:

```typescript
const invalidValues = [
  { name: 'policyNumber wrong pattern', patch: { policyNumber: 'XYZ-1' }, ... },
  { name: 'claimantName too short', patch: { claimantName: 'A' }, ... },
  // ... 7 more
];

for (const c of invalidValues) {
  test(`TC-C6 rejects when ${c.name}`, async ({ claims }) => {
    const res = await claims.create({ ...aValidCreateClaim(), ...c.patch });
    expect(res.status()).toBe(c.expectedStatus);
  });
}
```

Each iteration registers a distinct test (Playwright counts them individually). To add a new case, add one object to the array — no new function needed.

### Single Source of Truth for Schema Validation

Both the mock and the tests use the same AJV validator:

```
claims-api.yaml
     │
     ├─► mock validates requests:    validateCreateBody(req.body)
     └─► tests validate responses:   expectSchema(validators.Claim, body)
```

If a field is removed from the spec, both the mock (stops accepting it) and the tests (stops expecting it) change simultaneously. You cannot have a passing test suite with a broken mock — they share the same contract.

### Parallel-Safe Test Isolation

Playwright runs spec files concurrently. Multiple workers all hit the same in-memory mock server simultaneously. Tests that filter the claim list (`TC-L2`, `TC-L3`) need deterministic results.

Solution: each worker generates `policyNumber` values that only that worker will use. A filter on "my" policy number returns exactly my claims, never a claim created by another worker.

---

## 8. Running and Debugging

### Start the mock server manually
```bash
npm start
# or with request logging:
LOG_REQUESTS=true npm start
```
Visit `http://localhost:3000/claims` in a browser or Postman.

### Run the full test suite
```bash
npm test
# Opens the HTML report after:
npm run test:report
```

### Run a single spec file
```bash
npx playwright test tests/specs/create-claim.spec.ts
```

### Run tests against a real server (not the mock)
```bash
BASE_URL=http://your-server:3000 npm test
# or use the npm script:
npm run test:server
```

### Check TypeScript types
```bash
npm run typecheck
# runs: tsc --noEmit (checks types without producing output files)
```

### Run the linter
```bash
npm run lint
```

### Debug a failing test
1. Check the HTML report: `npm run test:report`
2. For network-level details, the trace zip is in `playwright-report/`. Open with:
   ```bash
   npx playwright show-trace playwright-report/trace.zip
   ```
3. Add `LOG_REQUESTS=true` to the webServer command in `playwright.config.ts` temporarily to see server-side logs.

---

## 9. Extending the Suite

### Add a new test case

1. Open the relevant spec file (or create a new one).
2. Add a `test(...)` call using the existing patterns.
3. If new setup is needed, add a helper method to `ClaimsClient` (`tests/support/claims-client.ts`).
4. Update `test-cases.md` to document the new test.

### Add a new API field

1. Add the field to `claims-api.yaml` (under the relevant schema).
2. Add the TypeScript type to `lib/types.ts`.
3. Add handling to `src/claims-mock-app.ts` (read it from req.body, store it, return it).
4. Add test coverage in the relevant spec file.

The AJV validators will automatically pick up the new field from the YAML at startup — no changes needed to `lib/openapi.ts`.

### Add a new API endpoint

1. Add the path and operation to `claims-api.yaml`.
2. Add the route handler to `src/claims-mock-app.ts`.
3. Add a method to `ClaimsClient` in `tests/support/claims-client.ts`.
4. Create a new spec file `tests/specs/<operation>.spec.ts`.
5. Update `test-cases.md` and `README.md`.

### Change the mock port

```bash
MOCK_PORT=4000 npm test
```

The `playwright.config.ts` reads `MOCK_PORT` and passes it through to both the webServer command and the `baseURL`. No file edits needed.
