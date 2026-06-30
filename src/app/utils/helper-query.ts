import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { orderItems, orders, platforms, users } from "../../db/schema";
import config from "../config";
import { buildOrderInfoBlock, type OrderInfoBlock } from "./order-email-info";

/** Fallback currency when a platform has no `config.currency` set. Preserves the
 *  historical hardcoded behaviour (every order email previously printed "AED"). */
export const DEFAULT_CURRENCY = "AED";

/**
 * Resolve a platform's display currency (3-letter ISO) from `platforms.config.currency`,
 * falling back to {@link DEFAULT_CURRENCY}. Used emit-side so the resolved code is FROZEN
 * into the event payload (the notification worker never re-fetches it) — consistent with
 * the rest of the order-email snapshot model.
 */
export const resolvePlatformCurrency = async (platformId: string): Promise<string> => {
    const [row] = await db
        .select({ config: platforms.config })
        .from(platforms)
        .where(eq(platforms.id, platformId))
        .limit(1);
    const cfg = (row?.config || {}) as Record<string, unknown>;
    const currency = cfg.currency;
    return typeof currency === "string" && currency.trim().length === 3
        ? currency.trim().toUpperCase()
        : DEFAULT_CURRENCY;
};

/**
 * Fetch an order by DB id and assemble its canonical {@link OrderInfoBlock}.
 *
 * The primary order-email emit sites (submit / quote / confirm) already have the
 * order row + company + item count in hand and call {@link buildOrderInfoBlock}
 * directly. This async convenience exists for the SECONDARY emit paths that only
 * carry a narrow order projection (cron auto-expiry cancellation, the post-quote
 * line-item reprice ripple, the generic entity-edit service) so they can attach a
 * full, consistent `order_info` block without widening their own queries. Returns
 * undefined if the order no longer exists. ORDER entity only.
 */
export const buildOrderInfoBlockById = async (
    orderDbId: string
): Promise<OrderInfoBlock | undefined> => {
    const order = await db.query.orders.findFirst({
        where: eq(orders.id, orderDbId),
        with: { company: { columns: { name: true } } },
    });
    if (!order) return undefined;
    const itemRows = await db
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.order_id, orderDbId));
    return buildOrderInfoBlock(order, {
        companyName: (order.company as { name?: string } | null)?.name,
        itemCount: itemRows.length,
    });
};

// -------------------------------- GET SYSTEM USER ----------------------------------
export const getSystemUser = async (platformId: string) => {
    const systemUser = await db.query.users.findFirst({
        where: and(eq(users.platform_id, platformId), eq(users.email, config.system_user_email)),
    });
    return systemUser;
};

// -------------------------------- GET PLATFORM ADMIN EMAILS ------------------------
export const getPlatformAdminEmails = async (platformId: string): Promise<string[]> => {
    const platformAdmins = await db
        .select({ email: users.email })
        .from(users)
        .where(
            and(
                eq(users.platform_id, platformId),
                eq(users.role, "ADMIN"),
                sql`${users.email} NOT LIKE '%@system.internal'`
            )
        );

    const platformAdminEmails = platformAdmins.map((admin) => admin.email);
    return platformAdminEmails;
};

// -------------------------------- GET PLATFORM LOGISTICS STAFF EMAILS --------------
export const getPlatformLogisticsStaffEmails = async (platformId: string): Promise<string[]> => {
    const platformLogisticsStaff = await db
        .select({ email: users.email })
        .from(users)
        .where(
            and(
                eq(users.platform_id, platformId),
                eq(users.role, "LOGISTICS"),
                sql`${users.email} NOT LIKE '%@system.internal'`
            )
        );

    const platformLogisticsStaffEmails = platformLogisticsStaff.map(
        (logisticsStaff) => logisticsStaff.email
    );
    return platformLogisticsStaffEmails;
};
