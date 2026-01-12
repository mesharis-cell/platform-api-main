import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { CalendarServices } from "./calendar.services";

/**
 * Controller for fetching calendar events.
 * 
 * Handles GET requests for calendar events, extracting query parameters
 * (month, year) and passing them to the calendar service.
 * 
 * Query Parameters:
 * - month: Optional, format YYYY-MM (e.g., "2024-12")
 * - year: Optional, format YYYY (e.g., "2024")
 * 
 * If both month and year are provided, month takes precedence.
 * If neither is provided, all events are returned.
 */
const getCalendarEvents = catchAsync(async (req, res) => {
  // Extract authenticated user and platform ID from request
  // These are attached by auth and platformValidator middleware
  const user = (req as any).user;
  const platformId = (req as any).platformId;

  // Call service to fetch calendar events
  const result = await CalendarServices.getCalendarEvents(
    req.query as { month?: string; year?: string },
    user,
    platformId
  );

  // Send successful response with calendar events
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Calendar events fetched successfully",
    meta: result.meta,
    data: result.data,
  });
});

export const CalendarControllers = {
  getCalendarEvents,
};
