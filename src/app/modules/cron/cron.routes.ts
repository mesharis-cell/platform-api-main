import { Router } from "express";
import { CronControllers } from "./cron.controllers";

const router = Router();

/**
 * POST /api/cron/event-end
 * Transition orders from IN_USE to AWAITING_RETURN when event end date is reached
 * Requires Bearer token authentication with CRON_SECRET
 */
router.post("/event-end", CronControllers.handleEventEndCron);

export const CronRoutes = router;
