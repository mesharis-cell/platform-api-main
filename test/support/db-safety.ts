/**
 * Re-export shim for the test-DB safety guards.
 *
 * The authoritative implementation lives at src/db/safety/guards.ts. Scenario
 * and lifecycle code imports from here so the call sites read cleanly as
 * "test infrastructure" without crossing the src/ → test/ layering boundary.
 */

export {
    MARKER_TABLE,
    MARKER_ROW_ID,
    markerRowExists,
    assertIsTestDatabase,
} from "../../src/db/safety/guards";
