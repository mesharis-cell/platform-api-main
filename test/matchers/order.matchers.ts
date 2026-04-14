import { eq } from "drizzle-orm";
import { db } from "../support/db";
import { orders } from "../../src/db/schema";

type MatcherResult = { pass: boolean; message: () => string };

export const toHaveOrderStatus = async (
    orderId: string,
    expected: string
): Promise<MatcherResult> => {
    const [row] = await db
        .select({ status: orders.order_status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
    const actual = row?.status ?? "<not found>";
    return {
        pass: actual === expected,
        message: () =>
            `expected order ${orderId} to have order_status "${expected}", got "${actual}"`,
    };
};

export const toHaveFinancialStatus = async (
    orderId: string,
    expected: string
): Promise<MatcherResult> => {
    const [row] = await db
        .select({ status: orders.financial_status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
    const actual = row?.status ?? "<not found>";
    return {
        pass: actual === expected,
        message: () =>
            `expected order ${orderId} to have financial_status "${expected}", got "${actual}"`,
    };
};
