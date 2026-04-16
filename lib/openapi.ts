/**
 * Shared OpenAPI / AJV layer.
 *
 * This module is the *single place* that loads `claims-api.yaml` and
 * compiles AJV validators from it. Both the mock server and the test
 * assertions import from here, so schema drift between server validation
 * and test assertions is structurally impossible.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));

const specPath = join(__dirname, '..', 'claims-api.yaml');

export const spec = yaml.parse(readFileSync(specPath, 'utf8')) as {
  components: { schemas: Record<string, unknown> };
};

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Register every component schema under its canonical ref key so that
// `$ref: '#/components/schemas/Foo'` resolves in both validator and mock.
for (const [name, schema] of Object.entries(spec.components.schemas)) {
  ajv.addSchema(schema as object, `#/components/schemas/${name}`);
}

export function getSchemaValidator(name: string): ValidateFunction {
  const fn = ajv.getSchema(`#/components/schemas/${name}`);
  if (fn === undefined) throw new Error(`Schema not registered: ${name}`);
  return fn;
}

export const validators = {
  Claim: getSchemaValidator('Claim'),
  ClaimsList: ajv.compile({
    type: 'array',
    items: { $ref: '#/components/schemas/Claim' },
  }),
  Error: getSchemaValidator('Error'),
};

export function formatErrors(fn: ValidateFunction): string {
  return (fn.errors ?? [])
    .map((e) => `  - ${e.instancePath || '(root)'} ${e.message ?? 'invalid'}`)
    .join('\n');
}
