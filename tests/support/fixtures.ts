/**
 * Playwright test fixtures — extend the base `test` with a typed `claims`
 * client so specs never instantiate it manually.
 */

import { test as base, expect } from '@playwright/test';
import { ClaimsClient } from './claims-client.js';
import { validators, formatErrors } from './schema.js';
import type { ValidateFunction } from 'ajv';

type Fixtures = {
  claims: ClaimsClient;
};

export const test = base.extend<Fixtures>({
  claims: async ({ request }, use) => {
    await use(new ClaimsClient(request));
  },
});

/** Assert that `value` validates against the given AJV-compiled schema. */
export function expectSchema(
  validator: ValidateFunction,
  value: unknown,
): void {
  const ok = validator(value);
  if (!ok) {
    throw new Error(
      `Response did not match schema:\n${formatErrors(validator)}\n\nGot:\n${JSON.stringify(
        value,
        null,
        2,
      )}`,
    );
  }
}

export { expect, validators };
