export type TimeGrouping = "month" | "quarter" | "year";

export interface TimePeriodMetrics {
    period: string; // Formatted label (e.g., "Jan 2026", "Q1 2026", "2026")
    periodStart: string; // ISO date string
    periodEnd: string; // ISO date string
    totalRevenue: number;
    totalMarginAmount: number;
    averageMarginPercent: number;
    orderCount: number;
}

export interface TimeSeries {
    timeSeries: TimePeriodMetrics[];
    filters: {
        companyId: string | null;
        companyName: string;
        groupBy: TimeGrouping;
        startDate?: string;
        endDate?: string;
    };
    totals: {
        totalRevenue: number;
        totalMarginAmount: number;
        totalOrderCount: number;
    };
}

export interface TimeSeriesQuery {
    groupBy: TimeGrouping;
    companyId?: string;
    startDate?: string;
    endDate?: string;
}

export interface MarginSummary {
    totalMarginAmount: number;
    averageMarginPercent: number;
    orderCount: number;
    timeRange: {
        start: string;
        end: string;
    };
    filters: {
        companyId: string | null;
        companyName: string;
    };
}

export type CompanyBreakdownSortBy = "revenue" | "margin" | "orderCount" | "companyName";

export interface CompanyMetrics {
    companyId: string;
    companyName: string;
    totalRevenue: number;
    totalMarginAmount: number;
    averageMarginPercent: number;
    orderCount: number;
    averageOrderValue: number;
}

export interface CompanyBreakdown {
    companies: CompanyMetrics[];
    timeRange: {
        start: string;
        end: string;
    };
    totals: {
        totalRevenue: number;
        totalMarginAmount: number;
        totalOrderCount: number;
    };
}
