/**
 * Playwright fixtures — extend the base `test` with a per-test `claims`
 * client so specs never instantiate it manually, and so we can swap the
 * transport in the future (e.g. authenticated client) in one place.
 */

import { test as base, expect } from '@playwright/test';
import { ClaimsClient } from './claims-client';
import { validators, formatErrors } from './schema';

type Fixtures = {
  claims: ClaimsClient;
};

export const test = base.extend<Fixtures>({
  claims: async ({ request }, use) => {
    await use(new ClaimsClient(request));
  },
});

/** Assert a value validates against an AJV-compiled schema, with a readable diff. */
export function expectSchema(
  validator: (typeof validators)[keyof typeof validators],
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
