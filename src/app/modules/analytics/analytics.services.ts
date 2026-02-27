import { and, eq, gte, inArray, lte } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, invoices, orders, prices } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { PricingService } from "../../services/pricing.service";
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

const toNum = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const pricingSelect = {
    breakdown_lines: prices.breakdown_lines,
    margin_percent: prices.margin_percent,
    margin_is_override: prices.margin_is_override,
    margin_override_reason: prices.margin_override_reason,
    calculated_at: prices.calculated_at,
};

const pricingMetrics = (pricing: unknown) => {
    const projected = PricingService.projectByRole(pricing as any, "ADMIN") as any;
    return {
        revenue: toNum(projected?.final_total),
        marginAmount: toNum(projected?.margin?.amount),
        marginPercent: toNum(projected?.margin?.percent ?? projected?.margin_policy?.percent),
    };
};

const periodStartFor = (date: Date, groupBy: "month" | "quarter" | "year") => {
    if (groupBy === "month") return new Date(date.getFullYear(), date.getMonth(), 1);
    if (groupBy === "quarter")
        return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
    return new Date(date.getFullYear(), 0, 1);
};

const periodEndFor = (periodStart: Date, groupBy: "month" | "quarter" | "year") => {
    if (groupBy === "month") {
        return new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0, 23, 59, 59, 999);
    }
    if (groupBy === "quarter") {
        return new Date(periodStart.getFullYear(), periodStart.getMonth() + 3, 0, 23, 59, 59, 999);
    }
    return new Date(periodStart.getFullYear(), 11, 31, 23, 59, 59, 999);
};

const getRevenueSummary = async (
    platformId: string,
    userCompanies: string[],
    company_id?: string,
    start_date?: string,
    end_date?: string,
    time_period?: "month" | "quarter" | "year"
) => {
    const timeRange = calculateTimeRange(start_date, end_date, time_period);
    const conditions = [
        eq(orders.platform_id, platformId),
        inArray(orders.order_status, REVENUE_ORDER_STATUSES as any),
        gte(invoices.invoice_paid_at, timeRange.start),
        lte(invoices.invoice_paid_at, timeRange.end),
    ];

    if (company_id) conditions.push(eq(orders.company_id, company_id));
    else if (!userCompanies.includes("*"))
        conditions.push(inArray(orders.company_id, userCompanies));

    const rows = await db
        .select({
            order_id: orders.id,
            pricing: pricingSelect,
        })
        .from(orders)
        .innerJoin(prices, eq(orders.order_pricing_id, prices.id))
        .leftJoin(invoices, eq(invoices.order_id, orders.id))
        .where(and(...conditions));

    const totalRevenue = rows.reduce((sum, row) => sum + pricingMetrics(row.pricing).revenue, 0);
    const orderCount = rows.length;
    const averageOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

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
        totalRevenue: Number(totalRevenue.toFixed(2)),
        orderCount,
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

const getTimeSeries = async (
    query: TimeSeriesQuery,
    user: AuthUser,
    platformId: string
): Promise<TimeSeries> => {
    const { groupBy, companyId, startDate, endDate } = query;
    const timeRange = calculateTimeRange(startDate, endDate, groupBy);

    const conditions: any[] = [
        eq(orders.platform_id, platformId),
        eq(orders.financial_status, "PAID"),
        gte(orders.created_at, timeRange.start),
        lte(orders.created_at, timeRange.end),
    ];

    if (companyId) conditions.push(eq(orders.company_id, companyId));
    else if (user.role === "CLIENT" && user.company_id)
        conditions.push(eq(orders.company_id, user.company_id));

    const rows = await db
        .select({
            created_at: orders.created_at,
            pricing: pricingSelect,
        })
        .from(orders)
        .innerJoin(prices, eq(orders.order_pricing_id, prices.id))
        .where(and(...conditions));

    const bucket = new Map<
        string,
        {
            periodStart: Date;
            totalRevenue: number;
            totalMarginAmount: number;
            marginPercentSum: number;
            orderCount: number;
        }
    >();

    for (const row of rows) {
        const createdAt = new Date(row.created_at);
        const periodStart = periodStartFor(createdAt, groupBy);
        const key = periodStart.toISOString();
        const metrics = pricingMetrics(row.pricing);
        const current = bucket.get(key) || {
            periodStart,
            totalRevenue: 0,
            totalMarginAmount: 0,
            marginPercentSum: 0,
            orderCount: 0,
        };
        current.totalRevenue += metrics.revenue;
        current.totalMarginAmount += metrics.marginAmount;
        current.marginPercentSum += metrics.marginPercent;
        current.orderCount += 1;
        bucket.set(key, current);
    }

    const timeSeries: TimePeriodMetrics[] = Array.from(bucket.values())
        .sort((a, b) => a.periodStart.getTime() - b.periodStart.getTime())
        .map((entry) => {
            const periodEnd = periodEndFor(entry.periodStart, groupBy);
            return {
                period: formatPeriodLabel(entry.periodStart, groupBy),
                periodStart: entry.periodStart.toISOString(),
                periodEnd: periodEnd.toISOString(),
                totalRevenue: Number(entry.totalRevenue.toFixed(2)),
                totalMarginAmount: Number(entry.totalMarginAmount.toFixed(2)),
                averageMarginPercent: Number(
                    (entry.orderCount > 0 ? entry.marginPercentSum / entry.orderCount : 0).toFixed(
                        2
                    )
                ),
                orderCount: entry.orderCount,
            };
        });

    let companyName = "All Companies";
    if (companyId) {
        const companyResult = await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, companyId))
            .limit(1);
        if (companyResult.length === 0)
            throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found");
        companyName = companyResult[0].name;
    } else if (user.role === "CLIENT" && user.company_id) {
        const companyResult = await db
            .select({ name: companies.name })
            .from(companies)
            .where(eq(companies.id, user.company_id))
            .limit(1);
        companyName = companyResult[0]?.name || "Unknown Company";
    }

    return {
        timeSeries,
        filters: {
            companyId: companyId || null,
            companyName,
            groupBy,
            startDate,
            endDate,
        },
        totals: {
            totalRevenue: Number(timeSeries.reduce((sum, m) => sum + m.totalRevenue, 0).toFixed(2)),
            totalMarginAmount: Number(
                timeSeries.reduce((sum, m) => sum + m.totalMarginAmount, 0).toFixed(2)
            ),
            totalOrderCount: timeSeries.reduce((sum, m) => sum + m.orderCount, 0),
        },
    };
};

const getMarginSummary = async (
    platformId: string,
    userCompanies: string[],
    company_id?: string,
    start_date?: string,
    end_date?: string,
    time_period?: "month" | "quarter" | "year"
): Promise<MarginSummary> => {
    const timeRange = calculateTimeRange(start_date, end_date, time_period);
    const conditions = [
        eq(orders.platform_id, platformId),
        inArray(orders.order_status, REVENUE_ORDER_STATUSES as any),
        gte(invoices.invoice_paid_at, timeRange.start),
        lte(invoices.invoice_paid_at, timeRange.end),
    ];

    if (company_id) conditions.push(eq(orders.company_id, company_id));
    else if (!userCompanies.includes("*"))
        conditions.push(inArray(orders.company_id, userCompanies));

    const rows = await db
        .select({ pricing: pricingSelect })
        .from(orders)
        .innerJoin(prices, eq(orders.order_pricing_id, prices.id))
        .leftJoin(invoices, eq(invoices.order_id, orders.id))
        .where(and(...conditions));

    const totalMarginAmount = rows.reduce(
        (sum, row) => sum + pricingMetrics(row.pricing).marginAmount,
        0
    );
    const avgMargin =
        rows.length > 0
            ? rows.reduce((sum, row) => sum + pricingMetrics(row.pricing).marginPercent, 0) /
              rows.length
            : 0;

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
        totalMarginAmount: Number(totalMarginAmount.toFixed(2)),
        averageMarginPercent: Number(avgMargin.toFixed(2)),
        orderCount: rows.length,
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
    const conditions = [
        eq(orders.platform_id, platformId),
        inArray(orders.order_status, REVENUE_ORDER_STATUSES as any),
        gte(invoices.invoice_paid_at, timeRange.start),
        lte(invoices.invoice_paid_at, timeRange.end),
    ];
    if (!userCompanies.includes("*")) conditions.push(inArray(orders.company_id, userCompanies));

    const rows = await db
        .select({
            companyId: orders.company_id,
            companyName: companies.name,
            pricing: pricingSelect,
        })
        .from(orders)
        .innerJoin(prices, eq(orders.order_pricing_id, prices.id))
        .innerJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(invoices, eq(invoices.order_id, orders.id))
        .where(and(...conditions));

    const byCompany = new Map<
        string,
        {
            companyName: string;
            totalRevenue: number;
            totalMarginAmount: number;
            marginPercentSum: number;
            orderCount: number;
        }
    >();
    for (const row of rows) {
        const metrics = pricingMetrics(row.pricing);
        const current = byCompany.get(row.companyId) || {
            companyName: row.companyName,
            totalRevenue: 0,
            totalMarginAmount: 0,
            marginPercentSum: 0,
            orderCount: 0,
        };
        current.totalRevenue += metrics.revenue;
        current.totalMarginAmount += metrics.marginAmount;
        current.marginPercentSum += metrics.marginPercent;
        current.orderCount += 1;
        byCompany.set(row.companyId, current);
    }

    const companyMetrics: CompanyMetrics[] = Array.from(byCompany.entries()).map(
        ([companyId, metric]) => ({
            companyId,
            companyName: metric.companyName,
            totalRevenue: Number(metric.totalRevenue.toFixed(2)),
            totalMarginAmount: Number(metric.totalMarginAmount.toFixed(2)),
            averageMarginPercent: Number(
                (metric.orderCount > 0 ? metric.marginPercentSum / metric.orderCount : 0).toFixed(2)
            ),
            orderCount: metric.orderCount,
            averageOrderValue: Number(
                (metric.orderCount > 0 ? metric.totalRevenue / metric.orderCount : 0).toFixed(2)
            ),
        })
    );

    const sortedMetrics = companyMetrics.sort((a, b) => {
        let comparison = 0;
        if (sort_by === "revenue") comparison = a.totalRevenue - b.totalRevenue;
        else if (sort_by === "margin") comparison = a.totalMarginAmount - b.totalMarginAmount;
        else if (sort_by === "orderCount") comparison = a.orderCount - b.orderCount;
        else comparison = a.companyName.localeCompare(b.companyName);
        return sort_order === "asc" ? comparison : -comparison;
    });

    return {
        companies: sortedMetrics,
        timeRange: {
            start: timeRange.start.toISOString(),
            end: timeRange.end.toISOString(),
        },
        totals: {
            totalRevenue: Number(
                companyMetrics.reduce((sum, m) => sum + m.totalRevenue, 0).toFixed(2)
            ),
            totalMarginAmount: Number(
                companyMetrics.reduce((sum, m) => sum + m.totalMarginAmount, 0).toFixed(2)
            ),
            totalOrderCount: companyMetrics.reduce((sum, m) => sum + m.orderCount, 0),
        },
    };
};

export const AnalyticsServices = {
    getTimeSeries,
    getRevenueSummary,
    getMarginSummary,
    getCompanyBreakdown,
};
