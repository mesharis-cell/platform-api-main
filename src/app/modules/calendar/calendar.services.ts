import { and, asc, eq, isNull, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { brands, orders } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { CalendarEvent, CalendarQueryParams } from "./calendar.interfaces";

/**
 * Fetches calendar events (orders) for a client user's company.
 * 
 * This service retrieves orders filtered by month or year and transforms them
 * into calendar event format with essential details like venue, dates, and brand.
 * 
 * @param query - Query parameters containing optional month (YYYY-MM) or year (YYYY) filters
 * @param user - Authenticated user object containing company_id
 * @param platformId - The platform ID for multi-tenancy filtering
 * @returns Promise<CalendarEventsResponse> - Object containing array of calendar events
 * @throws CustomizedError if user has invalid company access
 */
const getCalendarEvents = async (
  query: CalendarQueryParams,
  user: any,
  platformId: string
): Promise<CalendarEvent[]> => {
  const { month, year } = query;

  // Get user's company (Client Users have single company in company_id)
  const userCompanyId = user.company_id;
  if (!userCompanyId) {
    throw new CustomizedError(httpStatus.FORBIDDEN, "Invalid company access");
  }

  // Build WHERE conditions
  // Start with required conditions: platform, company, and not deleted
  const conditions: any[] = [
    eq(orders.platform_id, platformId),
    eq(orders.company_id, userCompanyId),
    isNull(orders.deleted_at)
  ];

  // Apply month filter if provided
  // Month format: YYYY-MM (e.g., "2024-12")
  if (month) {
    // Calculate start of month (first day)
    const startOfMonth = `${month}-01`;

    // Calculate end of month (last day)
    // Split month into year and month parts
    const [yearStr, monthStr] = month.split('-');
    const monthNum = parseInt(monthStr, 10);
    // Get last day of month by creating date for next month's day 0
    const lastDay = new Date(parseInt(yearStr, 10), monthNum, 0).getDate();
    const endOfMonth = `${month}-${String(lastDay).padStart(2, '0')}`;

    // Add date range conditions using raw SQL for timestamp comparison
    conditions.push(sql`${orders.event_start_date} >= ${startOfMonth}`);
    conditions.push(sql`${orders.event_start_date} <= ${endOfMonth}`);
  }
  // Apply year filter if month not provided
  else if (year) {
    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;

    conditions.push(sql`${orders.event_start_date} >= ${startOfYear}`);
    conditions.push(sql`${orders.event_start_date} <= ${endOfYear}`);
  }

  // Query orders with all conditions applied
  // Orders are sorted by event start date in ascending order
  const calendarOrders = await db
    .select()
    .from(orders)
    .where(and(...conditions))
    .orderBy(asc(orders.event_start_date));

  // Transform orders into calendar events with additional brand details
  // Using Promise.all to fetch brand data concurrently for each order
  const eventsWithDetails: CalendarEvent[] = await Promise.all(
    calendarOrders.map(async (order) => {
      // Fetch brand data if the order has a brand_id
      let brandData = null;
      if (order.brand_id) {
        [brandData] = await db
          .select()
          .from(brands)
          .where(eq(brands.id, order.brand_id));
      }

      // Extract city from venue_location JSON field
      const venueLocation = order.venue_location as { city?: string } | null;

      // Return transformed calendar event object
      return {
        id: order.id,
        order_id: order.order_id,
        title: `${order.venue_name} Event`,
        event_start_date: order.event_start_date,
        event_end_date: order.event_end_date,
        venue_name: order.venue_name,
        venue_city: venueLocation?.city || null,
        status: order.order_status,
        brand: brandData ? { id: brandData.id, name: brandData.name } : null,
      };
    })
  );

  return eventsWithDetails;
};

export const CalendarServices = {
  getCalendarEvents,
};
