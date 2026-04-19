/**
 * Registers all custom matchers with bun:test's `expect`. This module is
 * imported once from test/setup/preload.ts so every test file sees the
 * matchers via the ambient declaration in ./types.d.ts.
 */

import { expect } from "bun:test";
import { toHaveOrderStatus, toHaveFinancialStatus } from "./order.matchers";
import { toHaveEmittedEvent } from "./event.matchers";
import { toHaveDispatchedEmail } from "./email.matchers";
import { toBeDeniedWith, toBeOk } from "./response.matchers";

expect.extend({
    toHaveOrderStatus,
    toHaveFinancialStatus,
    toHaveEmittedEvent,
    toHaveDispatchedEmail,
    toBeDeniedWith,
    toBeOk,
});
