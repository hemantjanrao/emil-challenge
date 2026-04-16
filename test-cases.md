# EMIL Claims API — Test Cases

All test cases are derived directly from [`claims-api.yaml`](./claims-api.yaml) and
implemented in [`tests/specs/`](./tests/specs). Each TC ID below corresponds to
a `test('TC-…')` in the suite, so a reviewer can jump from the spec to the
implementation in one step.

## Conventions

- **Status codes:** `400` for schema / syntax violations, `404` for missing
  resources, `422` for business-rule violations (invalid status transition,
  missing payout). `200` on read/update success, `201` on create success.
- **Error shape:** every non-2xx response conforms to the `Error` schema
  (`{ code, message, details? }`). Asserted by every negative test and by
  the dedicated schema-compliance suite.
- **Parallel safety:** tests isolate themselves by generating a unique
  `policyNumber` per claim (see `tests/support/claim-builder.ts`).

---

## 1. POST /claims — Create

| ID     | Scenario                                                        | Expected                                                                 |
|--------|------------------------------------------------------------------|--------------------------------------------------------------------------|
| TC-C1  | Valid payload                                                    | `201`, body matches `Claim`, `status=OPEN`, `Location` header set        |
| TC-C2  | Created claim is retrievable via `GET /claims/{id}`              | `GET` returns identical body                                             |
| TC-C3  | Client explicitly supplies `status=OPEN`                         | `201`, body matches `Claim`, `status=OPEN`                               |
| TC-C4  | Client supplies `id`                                             | `400 VALIDATION_ERROR` (unknown field — server mints the id)             |
| TC-C5  | Missing required field (×4: policyNumber, claimantName, …)       | `400 VALIDATION_ERROR`                                                   |
| TC-C6  | Invalid value (×9: wrong pattern, bad initial status, …)         | `400 VALIDATION_ERROR`                                                   |
| TC-C7  | `damageDate` in the future                                       | `422 DAMAGE_DATE_IN_FUTURE`                                              |
| TC-C8  | Malformed JSON body                                              | `400 INVALID_JSON`                                                       |
| TC-C9  | Error body conforms to `Error` schema                            | AJV validation passes                                                    |

## 2. GET /claims/{id} — Read

| ID     | Scenario                              | Expected                                     |
|--------|---------------------------------------|----------------------------------------------|
| TC-G1  | Existing id                           | `200`, body matches `Claim`                  |
| TC-G2  | Valid UUID, unknown id                | `404 CLAIM_NOT_FOUND`                        |
| TC-G3  | Non-UUID id in path                   | `400 INVALID_ID`                             |

## 3. PATCH /claims/{id} — Update status

The workflow is:

```
 OPEN ──► IN_REVIEW ──► APPROVED ──► PAID
              │
              └──► REJECTED
```

### 3a. Happy paths

| ID     | Scenario                                                       | Expected                                       |
|--------|-----------------------------------------------------------------|------------------------------------------------|
| TC-U1  | Full happy path `OPEN → IN_REVIEW → APPROVED(+payout) → PAID`  | every step `200`, schema-valid                 |
| TC-U2  | Rejection branch `OPEN → IN_REVIEW → REJECTED`                 | every step `200`                               |
| TC-U3  | `updatedAt` advances on each transition; `createdAt` unchanged | `updatedAt(new) > updatedAt(old)`              |

### 3b. Transition matrix (TC-U4, data-driven)

A single parameterised test (`TC-U4`) asserts **every forbidden (from, to) pair** returns
`422 INVALID_STATUS_TRANSITION`:

| From ↓ / To →  | OPEN | IN_REVIEW | APPROVED | REJECTED | PAID |
|----------------|:----:|:---------:|:--------:|:--------:|:----:|
| **OPEN**       |  —   |    ok     |   422    |   422    | 422  |
| **IN_REVIEW**  | 422  |    —      |   ok     |   ok     | 422  |
| **APPROVED**   | 422  |   422     |   —      |   422    | ok   |
| **REJECTED**   | 422  |   422     |   422    |   —      | 422  |
| **PAID**       | 422  |   422     |   422    |   422    | —    |

### 3c. Invariants & edge cases

| ID     | Scenario                                                                 | Expected                           |
|--------|---------------------------------------------------------------------------|------------------------------------|
| TC-U5  | Self-transition (`status` equals current value)                           | `200`, no-op                       |
| TC-U6  | `IN_REVIEW → APPROVED` without `payoutAmount`                             | `422 PAYOUT_REQUIRED`              |
| TC-U7  | `APPROVED → PAID` re-uses the previously-set `payoutAmount`               | `200`, payout persists             |
| TC-U8  | `status` is not one of the enum values                                    | `400 VALIDATION_ERROR`             |
| TC-U9  | Empty body `{}`                                                           | `400` (spec: `minProperties: 1`)   |
| TC-U10 | Unknown field in body                                                     | `400` (`additionalProperties:false`)|
| TC-U11 | PATCH a non-existent id                                                   | `404 CLAIM_NOT_FOUND`              |

## 4. GET /claims — List / filter

| ID     | Scenario                                                   | Expected                                 |
|--------|------------------------------------------------------------|------------------------------------------|
| TC-L1  | Unfiltered                                                 | `200`, body validates as `array<Claim>`  |
| TC-L2  | Filter by `policyNumber`                                   | returns exactly the seeded claim         |
| TC-L3  | Filter by `status` (combined with `policyNumber`)          | every returned claim has that status     |
| TC-L4  | Filter with no matching rows                               | `200`, `[]` (never `404`)                |
| TC-L5  | Unknown `status` value                                     | `400 INVALID_QUERY_PARAM`                |
| TC-L6  | Malformed `policyNumber` (doesn't match pattern)           | `400 INVALID_QUERY_PARAM`                |

## 5. Schema-compliance meta-suite

A dedicated file (`schema-compliance.spec.ts`) asserts — end-to-end — that every
success response matches its declared schema and every error response matches
the shared `Error` schema. This is what keeps the OpenAPI spec honest.
