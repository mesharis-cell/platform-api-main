/**
 * Test-suite Drizzle handle.
 *
 * Re-exports the same Drizzle client the app uses, already pointed at
 * DATABASE_URL_TEST by preload.ts. Assertion code and DB lifecycle helpers
 * import from here rather than from the app's db module directly — that way
 * if we later want per-worker DBs or a different pool config for tests, the
 * switch is one file.
 */

import { db as appDb } from "../../src/db";
import * as schema from "../../src/db/schema";

export const db = appDb;
export { schema };
