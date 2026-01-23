import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { NotificationLogControllers } from "./notification-logs.controllers";

const router = Router();

// Get failed/retrying notifications (ADMIN only)
router.get(
    "/failed",
    platformValidator,
    auth("ADMIN"),
    NotificationLogControllers.getFailedNotifications
);

// Retry a failed notification (ADMIN only)
router.post(
    "/:id/retry",
    platformValidator,
    auth("ADMIN"),
    NotificationLogControllers.retryNotification
);

export const NotificationLogRoutes = router;
