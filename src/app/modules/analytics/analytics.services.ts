import { and, eq, gte, lte, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, orders } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { TimeSeries, TimePeriodMetrics, TimeSeriesQuery } from "./analytics.interfaces";
import { calculateTimeRange, formatPeriodLabel } from "./analytics.utils";

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
        eq(orders.financial_status, 'PAID'),
        sql`${orders.final_pricing}->>'total_price' IS NOT NULL`,
    ];

    // Step 2a: Add date range filter (using created_at as proxy for invoice paid date)
    // Note: Adjust this to use invoice_paid_at when invoices table is properly linked
    conditions.push(gte(orders.created_at, timeRange.start));
    conditions.push(lte(orders.created_at, timeRange.end));

    // Step 2b: Company filtering
    if (companyId) {
        conditions.push(eq(orders.company_id, companyId));
    } else if (user.role === 'CLIENT' && user.company_id) {
        // CLIENT users can only see their company's data
        conditions.push(eq(orders.company_id, user.company_id));
    }

    // Step 3: Determine PostgreSQL date_trunc format
    const truncFormat = groupBy === 'month' ? 'month' : groupBy === 'quarter' ? 'quarter' : 'year';

    // Step 4: Create the date truncation expression
    const periodExpression = sql`date_trunc(${sql.raw(`'${truncFormat}'`)}, ${orders.created_at})`;

    // Step 5: Execute query with time grouping
    const result = await db
        .select({
            period: sql<Date>`${periodExpression}`.as('period'),
            totalRevenue: sql<number>`COALESCE(SUM((${orders.final_pricing}->>'total_price')::numeric), 0)`,
            totalMarginAmount: sql<number>`COALESCE(SUM((${orders.platform_pricing}->>'margin_amount')::numeric), 0)`,
            averageMarginPercent: sql<number>`COALESCE(AVG((${orders.platform_pricing}->>'margin_percent')::numeric), 0)`,
            orderCount: sql<number>`COUNT(*)`,
        })
        .from(orders)
        .where(and(...conditions))
        .groupBy(periodExpression)
        .orderBy(periodExpression);

    // Step 6: Format time series data
    const timeSeries: TimePeriodMetrics[] = result.map((row) => {
        const periodDate = new Date(row.period as Date);
        const periodLabel = formatPeriodLabel(periodDate, groupBy);

        // Calculate period end based on grouping
        let periodEnd: Date;
        if (groupBy === 'month') {
            periodEnd = new Date(
                periodDate.getFullYear(),
                periodDate.getMonth() + 1,
                0,
                23,
                59,
                59,
                999
            );
        } else if (groupBy === 'quarter') {
            const quarterMonth = Math.floor(periodDate.getMonth() / 3) * 3;
            periodEnd = new Date(
                periodDate.getFullYear(),
                quarterMonth + 3,
                0,
                23,
                59,
                59,
                999
            );
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
    let companyName = 'All Companies';
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
    } else if (user.role === 'CLIENT' && user.company_id) {
        // Get CLIENT user's company name
        const companyResult = await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, user.company_id))
            .limit(1);

        companyName = companyResult[0]?.name || 'Unknown Company';
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

export const AnalyticsServices = {
    getTimeSeries,
};
