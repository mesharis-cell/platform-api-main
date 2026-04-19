/**
 * Test-specific constants. Env loading happens in src/bootstrap/env.ts
 * (imported as a side-effect by test/setup/preload.ts before any tests run).
 */

export const testInbox = {
    admin: "e2e.kadence.admin@homeofpmg.com",
    logistics: "e2e.kadence.logistics@homeofpmg.com",
    client: "e2e.kadence.client@homeofpmg.com",
} as const;

export type TestInbox = typeof testInbox;
