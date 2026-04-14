/**
 * Test-suite constants shared across scenarios, factories, and helpers.
 * Single source of truth for values that are duplicated in src/db/seed-test.ts.
 *
 * If seed-test.ts changes a constant here, this file must change too —
 * assertion failures from mismatches should point you here.
 */

export const TEST_PLATFORM_DOMAIN = "demo.kadence.test";
export const TEST_COMPANY_NAME = "Kadence Demo";

// The E2E scenario uses the stakeholder's real Outlook aliases so Resend
// delivery can be verified against actual mailboxes. The `docsClient` user
// (Alex Chen) exists separately for docs screenshots — scenarios don't use it.
export const TEST_INBOX = {
    admin: "e2e.kadence.admin@homeofpmg.com",
    logistics: "e2e.kadence.logistics@homeofpmg.com",
    client: "e2e.kadence.client@homeofpmg.com",
} as const;
