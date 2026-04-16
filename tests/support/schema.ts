import type { ValidateFunction } from 'ajv';
export { validators, spec } from '../../lib/openapi.js';

export function formatErrors(fn: ValidateFunction): string {
  return (fn.errors ?? [])
    .map((e) => `  - ${e.instancePath || '(root)'} ${e.message ?? 'invalid'}`)
    .join('\n');
}
