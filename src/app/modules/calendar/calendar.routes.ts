import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { CalendarControllers } from "./calendar.controllers";

const router = Router();

router.get(
  "/",
  platformValidator,
  auth("ADMIN", "LOGISTICS", "CLIENT"),
  CalendarControllers.getCalendarEvents
);

export const CalendarRoutes = router;
