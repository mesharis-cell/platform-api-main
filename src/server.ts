// MUST be first — loads + validates env before any other module imports run.
// In deployed EB containers, env comes from EB env properties; .env files are
// not shipped so the dotenv.config calls inside this module are no-ops there.
import "./bootstrap/env";

import http from "http";
import cron from "node-cron";
import app from "./app";
import config from "./app/config";
import { CronServices } from "./app/modules/cron/cron.services";
import { registerHandlers } from "./app/events";
import { NotificationQueueService } from "./app/services/notification-queue.service";

const port = config.port || 9000;

const server = http.createServer(app);

async function main() {
    try {
        // Register event handlers
        registerHandlers();
        await NotificationQueueService.start();

        // start server
        server.listen(port, () => {
            // Print APP_ENV alongside startup so it's instantly obvious whether
            // this server is hitting test/staging/prod — catches misrouting
            // before destructive ops happen.
            console.log(
                `${config.app_name} server is running on port ${port} | APP_ENV=${process.env.APP_ENV ?? "<unset>"}`
            );
        });

        // Run daily at midnight (00:00) to transition orders from IN_USE to AWAITING_RETURN
        cron.schedule("0 0 * * *", async () => {
            console.log("🕐 Running scheduled cron: Event end date transitions");
            try {
                await CronServices.transitionOrdersBasedOnEventDates();
                await CronServices.sendPickupReminders();
                await CronServices.transitionSelfPickupReturns();
                await CronServices.deleteExpiredOTPs();
                await CronServices.expireStuckQuotes();
            } catch (error) {
                console.error("❌ Cron job failed:", error);
            }
        });
    } catch (error) {
        console.log(error);
    }
}

// handle unhandledRejection
process.on("unhandledRejection", () => {
    console.log("Unhandled rejection is detected. shutting down...");
    if (server) {
        server.close(() => {
            process.exit(1);
        });
    }
    process.exit(1);
});

// handle uncaught expception
process.on("uncaughtException", () => {
    console.log("Uncaught exception is detected. shutting down...");
    process.exit(1);
});

main();
