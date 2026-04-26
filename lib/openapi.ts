/**
 * lib/openapi.ts — shared OpenAPI spec loader and AJV validator factory.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Both the mock server (src/) and the test suite (tests/) need to validate
 * JSON payloads against the same schemas. Rather than loading the YAML file
 * twice, this module does it once and exports ready-to-use validator functions
 * that both sides import.
 *
 * WHAT AJV IS
 * ───────────
 * AJV (Another JSON Validator) is a library that compiles JSON Schema
 * definitions into fast validator functions. A validator function takes any
 * value, returns true/false, and populates `.errors` on failure.
 *
 * WHAT AJV-FORMATS IS
 * ───────────────────
 * The base AJV package does not understand string formats like "date" or
 * "email". `addFormats` adds support for them so `format: date` in the YAML
 * is actually enforced at runtime.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

// __dirname is not available in ES modules, so we derive it from the current
// file's URL using Node's built-in helpers.
const __dirname = dirname(fileURLToPath(import.meta.url));

// Build the absolute path to the spec file one directory up from /lib.
const specPath = join(__dirname, '..', 'claims-api.yaml');

/**
 * The parsed OpenAPI specification object.
 * Typed just enough for the parts we access (components.schemas).
 * Exported so the mock server can read things like the ClaimStatus enum list.
 */
export const spec = yaml.parse(readFileSync(specPath, 'utf8')) as {
  components: { schemas: Record<string, unknown> };
};

// Create the AJV instance.
//   allErrors: true  → collect ALL validation errors, not just the first one.
//   strict: false    → don't error on unknown OpenAPI keywords AJV doesn't know.
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv); // enables format: date, format: uuid, etc.

// Register every component schema under its canonical JSON-Pointer key.
// This makes `$ref: '#/components/schemas/Claim'` resolve correctly inside
// other schemas (e.g. ClaimsList uses a $ref to Claim).
for (const [name, schema] of Object.entries(spec.components.schemas)) {
  ajv.addSchema(schema as object, `#/components/schemas/${name}`);
}

/**
 * Look up a compiled validator by component schema name.
 * Throws immediately if the name is wrong (fail-fast at startup, not at test time).
 *
 * Usage:
 *   const validate = getSchemaValidator('CreateClaimRequest');
 *   const ok = validate(requestBody);  // ok is true/false
 *   if (!ok) console.log(validate.errors);
 */
export function getSchemaValidator(name: string): ValidateFunction {
  const fn = ajv.getSchema(`#/components/schemas/${name}`);
  if (fn === undefined) throw new Error(`Schema not registered: ${name}`);
  return fn;
}

/**
 * Pre-compiled validators for the response shapes the tests assert on.
 *
 *   validators.Claim      — a single Claim object
 *   validators.ClaimsList — an array of Claim objects  (built inline here)
 *   validators.Error      — the API error envelope { code, message, details? }
 */
export const validators = {
  Claim: getSchemaValidator('Claim'),
  // Arrays aren't a standalone schema in the YAML, so we inline one here.
  ClaimsList: ajv.compile({
    type: 'array',
    items: { $ref: '#/components/schemas/Claim' },
  }),
  Error: getSchemaValidator('Error'),
};
