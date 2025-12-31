import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { CalendarControllers } from "./calendar.controllers";

const router = Router();

/**
 * GET /calendar
 * 
 * Fetches calendar events (orders) for the authenticated client user.
 * 
 * Authentication: Required (CLIENT role only)
 * 
 * Query Parameters:
 * - month (optional): Filter by month in YYYY-MM format (e.g., "2024-12")
 * - year (optional): Filter by year in YYYY format (e.g., "2024")
 * 
 * If month is provided, year is ignored.
 * If neither is provided, returns all events for the user's company.
 * 
 * Response:
 * {
 *   success: true,
 *   message: "Calendar events fetched successfully",
 *   data:  [
 *       {
 *         id: "uuid",
 *         order_id: "ORD-20241231-001",
 *         title: "Venue Name Event",
 *         event_start_date: "2024-12-31T00:00:00.000Z",
 *         event_end_date: "2025-01-02T00:00:00.000Z",
 *         venue_name: "Grand Ballroom",
 *         venue_city: "Dubai",
 *         status: "CONFIRMED",
 *         brand: { id: "uuid", name: "Brand Name" }
 *       }
 *     ]
 * }
 */
router.get(
  "/",
  platformValidator,
  auth("CLIENT"),
  CalendarControllers.getCalendarEvents
);

export const CalendarRoutes = router;
