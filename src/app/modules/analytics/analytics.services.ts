import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, invoices, orders, orderPrices } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import {
    TimeSeries,
    TimePeriodMetrics,
    TimeSeriesQuery,
    MarginSummary,
    CompanyBreakdown,
    CompanyBreakdownSortBy,
    CompanyMetrics,
} from "./analytics.interfaces";
import { calculateTimeRange, formatPeriodLabel, REVENUE_ORDER_STATUSES } from "./analytics.utils";

const getRevenueSummary = async (
    platformId: string,
    userCompanies: string[],
    company_id?: string,
    start_date?: string,
    end_date?: string,
    time_period?: "month" | "quarter" | "year"
) => {
    const timeRange = calculateTimeRange(start_date, end_date, time_period);

    // Build query conditions - always filter by platform
    const conditions = [
        eq(orders.platform_id, platformId),
        inArray(orders.order_status, REVENUE_ORDER_STATUSES as any),
    ];

    // Company filtering
    if (company_id) {
        conditions.push(eq(orders.company_id, company_id));
    } else if (!userCompanies.includes("*")) {
        conditions.push(inArray(orders.company_id, userCompanies));
    }

    // Execute query with invoice paid date filter
    const result = await db
        .select({
            totalRevenue: sql<number>`COALESCE(SUM(${orderPrices.final_total}::numeric), 0)`,
            orderCount: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .innerJoin(orderPrices, eq(orders.order_pricing_id, orderPrices.id))
        .leftJoin(invoices, eq(invoices.order_id, orders.id))
        .where(
            and(
                ...conditions,
                gte(invoices.invoice_paid_at, timeRange.start),
                lte(invoices.invoice_paid_at, timeRange.end)
            )
        );

    const data = result[0] || { totalRevenue: 0, orderCount: 0 };
    const averageOrderValue = data.orderCount > 0 ? data.totalRevenue / data.orderCount : 0;

    // Get company name if filtering by company
    let companyName = "All Companies";
    if (company_id) {
        const companyResult = await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, company_id))
            .limit(1);

        companyName = companyResult[0]?.name || "Unknown Company";
    }

    return {
        totalRevenue: Number(data.totalRevenue),
        orderCount: Number(data.orderCount),
        averageOrderValue: Number(averageOrderValue.toFixed(2)),
        timeRange: {
            start: timeRange.start.toISOString(),
            end: timeRange.end.toISOString(),
        },
        filters: {
            company_id: company_id || null,
            company_name: companyName,
        },
    };
};

// ----------------------------------- GET TIME SERIES -----------------------------------
const getTimeSeries = async (
    query: TimeSeriesQuery,
    user: AuthUser,
    platformId: string
): Promise<TimeSeries> => {
    const { groupBy, companyId, startDate, endDate } = query;

    // Step 1: Calculate time range
    const timeRange = calculateTimeRange(startDate, endDate, groupBy);

    // Step 2: Build query conditions
    const conditions: any[] = [
        eq(orders.platform_id, platformId),
        eq(orders.financial_status, "PAID"),
        sql`${orderPrices.final_total} IS NOT NULL`,
    ];

    // Step 2a: Add date range filter (using created_at as proxy for invoice paid date)
    // Note: Adjust this to use invoice_paid_at when invoices table is properly linked
    conditions.push(gte(orders.created_at, timeRange.start));
    conditions.push(lte(orders.created_at, timeRange.end));

    // Step 2b: Company filtering
    if (companyId) {
        conditions.push(eq(orders.company_id, companyId));
    } else if (user.role === "CLIENT" && user.company_id) {
        // CLIENT users can only see their company's data
        conditions.push(eq(orders.company_id, user.company_id));
    }

    // Step 3: Determine PostgreSQL date_trunc format
    const truncFormat = groupBy === "month" ? "month" : groupBy === "quarter" ? "quarter" : "year";

    // Step 4: Create the date truncation expression
    const periodExpression = sql`date_trunc(${sql.raw(`'${truncFormat}'`)}, ${orders.created_at})`;

    // Step 5: Execute query with time grouping
    const result = await db
        .select({
            period: sql<Date>`${periodExpression}`.as("period"),
            totalRevenue: sql<number>`COALESCE(SUM(${orderPrices.final_total}::numeric), 0)`,
            totalMarginAmount: sql<number>`COALESCE(SUM((${orderPrices.margin}->>'amount')::numeric), 0)`,
            averageMarginPercent: sql<number>`COALESCE(AVG((${orderPrices.margin}->>'percent')::numeric), 0)`,
            orderCount: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .innerJoin(orderPrices, eq(orders.order_pricing_id, orderPrices.id))
        .where(and(...conditions))
        .groupBy(periodExpression)
        .orderBy(periodExpression);

    // Step 6: Format time series data
    const timeSeries: TimePeriodMetrics[] = result.map((row) => {
        const periodDate = new Date(row.period as Date);
        const periodLabel = formatPeriodLabel(periodDate, groupBy);

        // Calculate period end based on grouping
        let periodEnd: Date;
        if (groupBy === "month") {
            periodEnd = new Date(
                periodDate.getFullYear(),
                periodDate.getMonth() + 1,
                0,
                23,
                59,
                59,
                999
            );
        } else if (groupBy === "quarter") {
            const quarterMonth = Math.floor(periodDate.getMonth() / 3) * 3;
            periodEnd = new Date(periodDate.getFullYear(), quarterMonth + 3, 0, 23, 59, 59, 999);
        } else {
            periodEnd = new Date(periodDate.getFullYear(), 11, 31, 23, 59, 59, 999);
        }

        return {
            period: periodLabel,
            periodStart: periodDate.toISOString(),
            periodEnd: periodEnd.toISOString(),
            totalRevenue: Number(row.totalRevenue),
            totalMarginAmount: Number(row.totalMarginAmount),
            averageMarginPercent: Number(
                parseFloat(row.averageMarginPercent.toString()).toFixed(2)
            ),
            orderCount: Number(row.orderCount),
        };
    });

    // Step 7: Get company name if filtering by company
    let companyName = "All Companies";
    if (companyId) {
        const companyResult = await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, companyId))
            .limit(1);

        if (companyResult.length === 0) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found");
        }

        companyName = companyResult[0].name;
    } else if (user.role === "CLIENT" && user.company_id) {
        // Get CLIENT user's company name
        const companyResult = await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, user.company_id))
            .limit(1);

        companyName = companyResult[0]?.name || "Unknown Company";
    }

    // Step 8: Calculate totals
    const totals = {
        totalRevenue: timeSeries.reduce((sum, m) => sum + m.totalRevenue, 0),
        totalMarginAmount: timeSeries.reduce((sum, m) => sum + m.totalMarginAmount, 0),
        totalOrderCount: timeSeries.reduce((sum, m) => sum + m.orderCount, 0),
    };

    // Step 9: Return formatted response
    return {
        timeSeries,
        filters: {
            companyId: companyId || null,
            companyName,
            groupBy,
            startDate,
            endDate,
        },
        totals,
    };
};

// ----------------------------------- GET MARGIN SUMMARY -----------------------------------
const getMarginSummary = async (
    platformId: string,
    userCompanies: string[],
    company_id?: string,
    start_date?: string,
    end_date?: string,
    time_period?: "month" | "quarter" | "year"
): Promise<MarginSummary> => {
    const timeRange = calculateTimeRange(start_date, end_date, time_period);

    // Build query conditions - always filter by platform
    const conditions = [
        eq(orders.platform_id, platformId),
        inArray(orders.order_status, REVENUE_ORDER_STATUSES as any),
    ];

    // Company filtering
    if (company_id) {
        conditions.push(eq(orders.company_id, company_id));
    } else if (!userCompanies.includes("*")) {
        conditions.push(inArray(orders.company_id, userCompanies));
    }

    // Execute query with invoice paid date filter
    const result = await db
        .select({
            totalMarginAmount: sql<number>`COALESCE(SUM((${orderPrices.margin}->>'amount')::numeric), 0)`,
            averageMarginPercent: sql<number>`COALESCE(AVG((${orderPrices.margin}->>'percent')::numeric), 0)`,
            orderCount: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .innerJoin(orderPrices, eq(orders.order_pricing_id, orderPrices.id))
        .leftJoin(invoices, eq(invoices.order_id, orders.id))
        .where(
            and(
                ...conditions,
                gte(invoices.invoice_paid_at, timeRange.start),
                lte(invoices.invoice_paid_at, timeRange.end)
            )
        );

    const data = result[0] || {
        totalMarginAmount: 0,
        averageMarginPercent: 0,
        orderCount: 0,
    };

    // Get company name if filtering by company
    let companyName = "All Companies";
    if (company_id) {
        const companyResult = await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, company_id))
            .limit(1);

        companyName = companyResult[0]?.name || "Unknown Company";
    }

    return {
        totalMarginAmount: Number(data.totalMarginAmount),
        averageMarginPercent: Number(parseFloat(data.averageMarginPercent.toString()).toFixed(2)),
        orderCount: Number(data.orderCount),
        timeRange: {
            start: timeRange.start.toISOString(),
            end: timeRange.end.toISOString(),
        },
        filters: {
            companyId: company_id || null,
            companyName,
        },
    };
};

// ----------------------------------- GET COMPANY BREAKDOWN -----------------------------------
const getCompanyBreakdown = async (
    platformId: string,
    userCompanies: string[],
    start_date?: string,
    end_date?: string,
    time_period?: "month" | "quarter" | "year",
    sort_by: CompanyBreakdownSortBy = "revenue",
    sort_order: "asc" | "desc" = "desc"
): Promise<CompanyBreakdown> => {
    const timeRange = calculateTimeRange(start_date, end_date, time_period);

    // Build query conditions - always filter by platform
    const conditions = [
        eq(orders.platform_id, platformId),
        inArray(orders.order_status, REVENUE_ORDER_STATUSES as any),
    ];

    // Company scope filtering
    if (!userCompanies.includes("*")) {
        conditions.push(inArray(orders.company_id, userCompanies));
    }

    // Execute query with grouping by company
    const result = await db
        .select({
            companyId: orders.company_id,
            companyName: companies.name,
            totalRevenue: sql<number>`COALESCE(SUM(${orderPrices.final_total}::numeric), 0)`,
            totalMarginAmount: sql<number>`COALESCE(SUM((${orderPrices.margin}->>'amount')::numeric), 0)`,
            averageMarginPercent: sql<number>`COALESCE(AVG((${orderPrices.margin}->>'percent')::numeric), 0)`,
            orderCount: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .innerJoin(orderPrices, eq(orders.order_pricing_id, orderPrices.id))
        .innerJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(invoices, eq(invoices.order_id, orders.id))
        .where(
            and(
                ...conditions,
                gte(invoices.invoice_paid_at, timeRange.start),
                lte(invoices.invoice_paid_at, timeRange.end)
            )
        )
        .groupBy(orders.company_id, companies.name);

    // Calculate average order value and format data
    const companyMetrics: CompanyMetrics[] = result.map((row) => {
        const orderCount = Number(row.orderCount);
        const totalRevenue = Number(row.totalRevenue);
        const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

        return {
            companyId: row.companyId,
            companyName: row.companyName,
            totalRevenue,
            totalMarginAmount: Number(row.totalMarginAmount),
            averageMarginPercent: Number(
                parseFloat(row.averageMarginPercent.toString()).toFixed(2)
            ),
            orderCount,
            averageOrderValue: Number(averageOrderValue.toFixed(2)),
        };
    });

    // Sort results
    const sortedMetrics = companyMetrics.sort((a, b) => {
        let comparison = 0;

        switch (sort_by) {
            case "revenue":
                comparison = a.totalRevenue - b.totalRevenue;
                break;
            case "margin":
                comparison = a.totalMarginAmount - b.totalMarginAmount;
                break;
            case "orderCount":
                comparison = a.orderCount - b.orderCount;
                break;
            case "companyName":
                comparison = a.companyName.localeCompare(b.companyName);
                break;
        }

        return sort_order === "asc" ? comparison : -comparison;
    });

    // Calculate totals
    const totals = {
        totalRevenue: companyMetrics.reduce((sum, m) => sum + m.totalRevenue, 0),
        totalMarginAmount: companyMetrics.reduce((sum, m) => sum + m.totalMarginAmount, 0),
        totalOrderCount: companyMetrics.reduce((sum, m) => sum + m.orderCount, 0),
    };

    return {
        companies: sortedMetrics,
        timeRange: {
            start: timeRange.start.toISOString(),
            end: timeRange.end.toISOString(),
        },
        totals,
    };
};

export const AnalyticsServices = {
    getTimeSeries,
    getRevenueSummary,
    getMarginSummary,
    getCompanyBreakdown,
};
