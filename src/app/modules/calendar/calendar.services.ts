import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { brands, companies, orders } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { CalendarQueryParams } from "./calendar.interfaces";
import paginationMaker from "../../utils/pagination-maker";

const getCalendarEvents = async (
  query: CalendarQueryParams,
  user: any,
  platformId: string
) => {
  const {
    page,
    limit,
    month, year
  } = query;

  // Step 1: Setup pagination
  const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
    paginationMaker({
      page,
      limit,
      sort_by: "event_start_date",
      sort_order: "asc",
    });

  // Step 2: Build WHERE conditions
  const conditions: any[] = [
    eq(orders.platform_id, platformId),
    isNull(orders.deleted_at)
  ];

  // Step 2a: Filter by user role (CLIENT users see only their company's orders)
  if (user.role === 'CLIENT') {
    if (user.company_id) {
      conditions.push(eq(orders.company_id, user.company_id));
    } else {
      throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
    }
  }

  // Step 2b: Apply month filter if provided
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
  // Step 2c: Apply year filter if month not provided
  else if (year) {
    const startOfYear = `${year}-01-01`;
    const endOfYear = `${year}-12-31`;

    conditions.push(sql`${orders.event_start_date} >= ${startOfYear}`);
    conditions.push(sql`${orders.event_start_date} <= ${endOfYear}`);
  }

  // Step 3: Fetch data with pagination and sorting
  const results = await db
    .select({
      order: orders,
      company: {
        id: companies.id,
        name: companies.name,
      },
      brand: {
        id: brands.id,
        name: brands.name,
      }
    })
    .from(orders)
    .leftJoin(companies, eq(orders.company_id, companies.id))
    .leftJoin(brands, eq(orders.brand_id, brands.id))
    .where(and(...conditions))
    .orderBy(asc(orders.event_start_date))
    .limit(limitNumber)
    .offset(skip);

  // Step 4: Get total count
  const [countResult] = await db
    .select({ count: count() })
    .from(orders)
    .where(and(...conditions));

  // Step 5: Format results
  const formattedResults = results.map((result) => {
    const order = result.order;
    const company = result.company;
    const brand = result.brand;

    return {
      id: order.id,
      order_id: order.order_id,
      title: `${order.venue_name} Event`,
      event_start_date: order.event_start_date,
      event_end_date: order.event_end_date,
      venue_name: order.venue_name,
      venue_city: (order.venue_location as any)?.city || null,
      status: order.order_status,
      company: company ? { id: company.id, name: company.name } : null,
      brand: brand ? { id: brand.id, name: brand.name } : null,
    };
  });

  // Step 6: Return formatted results and meta data
  return {
    data: formattedResults,
    meta: {
      page: pageNumber,
      limit: limitNumber,
      total: countResult.count,
    },
  };
};

export const CalendarServices = {
  getCalendarEvents,
};
