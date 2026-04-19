/**
 * Suite and scenario-file lifecycle helpers.
 *
 * - bootstrapSuite()      → start Express on random port, return teardown
 * - truncateBusinessData()→ wipe scenario-generated rows, preserve scaffolding
 * - verifySchema()        → fail fast if schema drift vs drizzle journal
 *
 * Scaffolding tables (platforms, companies, users, access_policies, brands,
 * assets, asset_families, service_types, attachment_types, workflow_definitions,
 * notification_rules, countries, cities, warehouses, zones, teams, etc.)
 * are seeded once by seed-test.ts and SURVIVE between scenario files.
 *
 * Business tables (orders, scan_events, notification_logs, system_events,
 * etc.) are truncated before every scenario file so no cross-file state leaks.
 */

import http from "http";
import { eq, sql } from "drizzle-orm";
import { db } from "../support/db";
import { assertIsTestDatabase } from "../support/db-safety";
import { registerHandlers } from "../../src/app/events";
import { NotificationQueueService } from "../../src/app/services/notification-queue.service";
import { assertAppEnv } from "../../src/db/safety/guards";
import { notificationLogs } from "../../src/db/schema";

// Safety gate: APP_ENV must be "testing" when this file loads. If someone
// invokes `bun test` without the `APP_ENV=testing` prefix + preload
// (see package.json `test:e2e`), this throws at module-load time — long
// before truncateBusinessData can touch the wrong DB. The marker-row check
// in assertIsTestDatabase() provides the second, stronger gate.
assertAppEnv(["testing"]);

// Tables truncated between scenario files. Order doesn't matter because we use
// TRUNCATE ... RESTART IDENTITY CASCADE.
const BUSINESS_TABLES = [
    "notification_logs",
    "system_events",
    "scan_event_media",
    "scan_event_assets",
    "scan_events",
    "order_transport_trips",
    "line_item_requests",
    "entity_attachments",
    "workflow_requests",
    "asset_bookings",
    "stock_movements",
    "financial_status_history",
    "order_status_history",
    "invoices",
    "line_items",
    "prices",
    "service_request_status_history",
    "service_request_items",
    "service_requests",
    "order_items",
    "orders",
    "inbound_request_items",
    "inbound_requests",
    "self_pickup_status_history",
    "self_pickup_items",
    "self_pickups",
    "self_booking_items",
    "self_bookings",
] as const;

export const truncateBusinessData = async (): Promise<void> => {
    await assertIsTestDatabase();
    const joined = BUSINESS_TABLES.map((t) => `"${t}"`).join(", ");
    await db.execute(sql.raw(`TRUNCATE TABLE ${joined} RESTART IDENTITY CASCADE`));
};

export const verifySchema = async (): Promise<void> => {
    // Minimal sanity check: can we query a canonical table the seed created?
    // Deep drift detection would compare against drizzle/meta/_journal.json;
    // deferred until we hit an actual drift bug.
    await db.execute(sql`SELECT 1 FROM "platforms" LIMIT 1`);
};

export type SuiteHandle = {
    port: number;
    baseUrl: string;
    stop: () => Promise<void>;
};

export const bootstrapSuite = async (): Promise<SuiteHandle> => {
    // Import app lazily — config module must read its env vars from preload.ts
    // before this import resolves.
    const appModule = await import("../../src/app");
    const app = appModule.default;

    // Mirror what src/server.ts does: register event handlers so email.handler
    // processes events, then start the notification queue worker so QUEUED
    // rows actually get sent to Resend.
    registerHandlers();
    await NotificationQueueService.start();

    const server = http.createServer(app);
    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Failed to bind test server to a random port");
    }
    const port = address.port;
    const baseUrl = `http://127.0.0.1:${port}`;

    return {
        port,
        baseUrl,
        stop: async () => {
            // Best-effort drain: wait up to 30s for QUEUED rows to be processed
            // so real emails land in Outlook before the worker stops.
            await drainNotificationQueue(30_000).catch((err) => {
                console.warn(`[test] notification queue drain warning: ${err.message}`);
            });
            NotificationQueueService.stop();
            await new Promise<void>((resolve, reject) => {
                server.close((err) => (err ? reject(err) : resolve()));
            });
        },
    };
};

/**
 * Polls `notification_logs` until no rows remain in QUEUED or PROCESSING
 * status. Used at suite teardown so the Resend worker has time to actually
 * send queued emails before the process exits.
 */
export const drainNotificationQueue = async (timeoutMs: number): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const pending = await db
            .select({ id: notificationLogs.id })
            .from(notificationLogs)
            .where(eq(notificationLogs.status, "QUEUED"));
        const processing = await db
            .select({ id: notificationLogs.id })
            .from(notificationLogs)
            .where(eq(notificationLogs.status, "PROCESSING"));
        if (pending.length === 0 && processing.length === 0) return;

        // Nudge the worker so we don't wait for the 1s interval tick.
        await NotificationQueueService.processNow().catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Notification queue did not drain within ${timeoutMs}ms`);
};
