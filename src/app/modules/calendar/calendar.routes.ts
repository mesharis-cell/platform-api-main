import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { CalendarControllers } from "./calendar.controllers";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.CALENDAR_READ),
    CalendarControllers.getCalendarEvents
);

export const CalendarRoutes = router;
