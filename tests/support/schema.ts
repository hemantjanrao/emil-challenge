/**
 * Re-exports the shared AJV validators and helpers from `lib/openapi.ts`.
 *
 * Tests import from here (short path) while the pipeline that loads the
 * YAML and compiles AJV lives in exactly one place.
 */
export { validators, formatErrors, spec } from '../../lib/openapi.js';
export type { } from '../../lib/openapi.js';
