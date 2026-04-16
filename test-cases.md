# EMIL Claims API — Test Cases

Derived from [`claims-api.yaml`](./claims-api.yaml). Each TC ID maps directly
to a `test('TC-…')` in [`tests/specs/`](./tests/specs).

---

## 1. POST /claims — Create

| ID    | Scenario | Expected |
|-------|----------|----------|
| TC-C1 | Valid payload | `201`, `status=OPEN`, `Location` header, body matches `Claim` schema |
| TC-C2 | Created claim is fetchable via GET | `GET /claims/{id}` returns identical body |
| TC-C3 | Explicit `status=OPEN` on create | `201` — the one allowed value clients may send |
| TC-C4 | Client supplies `id` field | `400 VALIDATION_ERROR` — server always mints the id |
| TC-C5 | Missing required field (×4: policyNumber, claimantName, damageDate, lossDescription) | `400 VALIDATION_ERROR` |
| TC-C6 | Invalid values (×9: wrong policyNumber pattern, too-short name, bad date format, non-OPEN initial status, unknown field, …) | `400 VALIDATION_ERROR` |
| TC-C7 | `damageDate` in the future | `422 DAMAGE_DATE_IN_FUTURE` — business rule, not a schema error |
| TC-C8 | Malformed JSON body | `400 INVALID_JSON` |
| TC-C9 | Error body shape | Response conforms to the `Error` schema |

## 2. GET /claims/{id} — Read

| ID    | Scenario | Expected |
|-------|----------|----------|
| TC-G1 | Existing id | `200`, body matches `Claim` schema |
| TC-G2 | Unknown UUID | `404 CLAIM_NOT_FOUND` |
| TC-G3 | Non-UUID path segment | `400 INVALID_ID` |

## 3. PATCH /claims/{id} — Update status

```
OPEN ──► IN_REVIEW ──► APPROVED ──► PAID
              │
              └──► REJECTED
```

| ID     | Scenario | Expected |
|--------|----------|----------|
| TC-U1  | Full workflow: OPEN → IN_REVIEW → APPROVED → PAID | Each step `200`; APPROVED body includes payout fields |
| TC-U2  | Rejection branch: OPEN → IN_REVIEW → REJECTED | `200` at each step |
| TC-U3  | `updatedAt` advances on transition; `createdAt` unchanged | timestamps behave correctly |
| TC-U4a | Skip a step: OPEN → APPROVED | `422 INVALID_STATUS_TRANSITION` |
| TC-U4b | Skip to terminal: OPEN → PAID | `422 INVALID_STATUS_TRANSITION` |
| TC-U4c | Go backwards: IN_REVIEW → OPEN | `422 INVALID_STATUS_TRANSITION` |
| TC-U4d | Move out of terminal state: PAID → IN_REVIEW | `422 INVALID_STATUS_TRANSITION` |
| TC-U5  | Approve without payoutAmount | `422 PAYOUT_REQUIRED` |
| TC-U6  | PAID inherits payoutAmount set at APPROVED | `200`, payout persists |
| TC-U7  | Payout fields before approval (representative OPEN claim) | `422 PAYOUT_NOT_ALLOWED` |
| TC-U8  | Unknown status value | `400 VALIDATION_ERROR` |
| TC-U9  | Non-existent claim | `404 CLAIM_NOT_FOUND` |

**Note on transition coverage:** TC-U4a–d cover four distinct *patterns* of
invalid transition rather than all 15 forbidden pairs. The cases chosen are:
skipping a step, reaching a terminal directly, going backwards, and moving out
of a terminal state. Those patterns cover the realistic client mistakes. If a
real backend is ever wired in, a fuller matrix is straightforward to add.

## 4. GET /claims — List / filter

| ID    | Scenario | Expected |
|-------|----------|----------|
| TC-L1 | Unfiltered | `200`, array of `Claim` |
| TC-L2 | Filter by `policyNumber` | Returns only the matching claim |
| TC-L3 | Filter by `status` | Every returned claim has that status |
| TC-L4 | No matches | `200`, empty array (never `404`) |
| TC-L5 | Unknown `status` filter value | `400 INVALID_QUERY_PARAM` |
| TC-L6 | Malformed `policyNumber` filter | `400 INVALID_QUERY_PARAM` |
