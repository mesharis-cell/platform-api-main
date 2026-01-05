import { TimeGrouping } from "./analytics.interfaces";

/**
 * Calculate time range based on custom dates or time period
 */
export function calculateTimeRange(
    startDate?: string,
    endDate?: string,
    timePeriod?: TimeGrouping
): { start: Date; end: Date } {
    const now = new Date();

    // If both custom dates provided, use them
    if (startDate && endDate) {
        return {
            start: new Date(startDate),
            end: new Date(endDate),
        };
    }

    // Calculate based on time period
    if (timePeriod === 'month') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { start, end };
    }

    if (timePeriod === 'quarter') {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const start = new Date(now.getFullYear(), currentQuarter * 3, 1, 0, 0, 0, 0);
        const end = new Date(
            now.getFullYear(),
            currentQuarter * 3 + 3,
            0,
            23,
            59,
            59,
            999
        );
        return { start, end };
    }

    if (timePeriod === 'year') {
        const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        return { start, end };
    }

    // Default: all time (from platform inception to next year)
    const start = new Date(2020, 0, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59, 999);
    return { start, end };
}

/**
 * Format period label based on grouping type
 */
export function formatPeriodLabel(date: Date, groupBy: TimeGrouping): string {
    const monthNames = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    if (groupBy === 'month') {
        return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    }

    if (groupBy === 'quarter') {
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        return `Q${quarter} ${date.getFullYear()}`;
    }

    // year
    return `${date.getFullYear()}`;
}
