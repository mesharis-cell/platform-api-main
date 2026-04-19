/**
 * Preload for `bun test --preload`. Runs BEFORE any test file or app module
 * is imported. Env loading + validation happens via src/bootstrap/env.ts
 * (side-effect import); we just make sure it runs, then register custom
 * matchers.
 *
 * Requires APP_ENV=testing set on the `bun test` invocation (via the test:e2e
 * script in package.json).
 */

import "../../src/bootstrap/env";

// Register custom matchers AFTER env is loaded so they can lazily import the
// app's Drizzle handle without opening a connection to the wrong DB.
import("../matchers");
