/**
 * AJV validator bound to the OpenAPI spec.
 *
 * The spec is the single source of truth: the mock serves it, the tests
 * validate against it. A drift between the two is itself a failing test.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

const specPath = path.join(__dirname, '..', '..', 'claims-api.yaml');
const spec = yaml.parse(fs.readFileSync(specPath, 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Register every component schema under its canonical `#/components/schemas/...`
// key so `$ref`s inside the spec resolve without any additional wiring.
for (const [name, schema] of Object.entries<Record<string, unknown>>(
  spec.components.schemas,
)) {
  ajv.addSchema(schema, `#/components/schemas/${name}`);
}

function compileByName(name: keyof typeof spec.components.schemas): ValidateFunction {
  const fn = ajv.getSchema(`#/components/schemas/${name as string}`);
  if (!fn) throw new Error(`Schema not registered: ${String(name)}`);
  return fn as ValidateFunction;
}

export const validators = {
  Claim: compileByName('Claim'),
  ClaimsList: ajv.compile({
    type: 'array',
    items: { $ref: '#/components/schemas/Claim' },
  }),
  Error: compileByName('Error'),
};

export function formatErrors(fn: ValidateFunction): string {
  return (fn.errors || [])
    .map((e) => `  - ${e.instancePath || '(root)'} ${e.message}`)
    .join('\n');
}

export { spec };
