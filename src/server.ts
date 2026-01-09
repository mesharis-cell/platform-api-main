import http from "http";
import cron from "node-cron";
import app from "./app";
import config from "./app/config";
import { CronServices } from "./app/modules/cron/cron.services";

const port = config.port || 9000;

const server = http.createServer(app);

async function main() {
  try {
    // start server
    server.listen(port, () => {
      console.log(`${config.app_name} server is running on port ${port}`);
    });

    // Run daily at midnight (00:00) to transition orders from IN_USE to AWAITING_RETURN
    cron.schedule("0 0 * * *", async () => {
      console.log("🕐 Running scheduled cron: Event end date transitions");
      try {
        await CronServices.transitionOrdersBasedOnEventDates()
        await CronServices.sendPickupReminders()
        await CronServices.deleteExpiredOTPs()
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
