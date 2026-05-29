import { and, count, desc, eq, gte, inArray, lte } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { orders, prices, selfPickups, users } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { resolveCompanyScope } from "../../utils/company-scope";
import { PricingService } from "../../services/pricing.service";

/**
 * Company Back Office read-only aggregates + cross-user lists. Every query is
 * scoped to resolveCompanyScope(user) (never a request param), and every
 * monetary value is the literal "CLIENT" projection (sell-side only — no
 * margin/buy cost). See CLAUDE.md client-visibility paranoia.
 */

// Order statuses for which a client-facing cost estimate has been issued
// (PENDING_APPROVAL is the first status DocumentService will generate one).
const ESTIMATE_ORDER_STATUSES = [
    "PENDING_APPROVAL",
    "QUOTED",
    "DECLINED",
    "CONFIRMED",
    "IN_PREPARATION",
    "READY_FOR_DELIVERY",
    "IN_TRANSIT",
    "DELIVERED",
    "IN_USE",
    "DERIG",
    "AWAITING_RETURN",
    "RETURN_IN_TRANSIT",
    "CLOSED",
] as const;

const ESTIMATE_SP_STATUSES = [
    "PENDING_APPROVAL",
    "QUOTED",
    "DECLINED",
    "CONFIRMED",
    "READY_FOR_PICKUP",
    "PICKED_UP",
    "AWAITING_RETURN",
    "CLOSED",
] as const;

const PRICING_COLUMNS = {
    breakdown_lines: prices.breakdown_lines,
    margin_percent: prices.margin_percent,
    vat_percent: prices.vat_percent,
    margin_is_override: prices.margin_is_override,
    margin_override_reason: prices.margin_override_reason,
    calculated_at: prices.calculated_at,
};

/** Dashboard tiles: counts only (cheap, margin-free). Spend sums are vNext. */
const getDashboardSummary = async (user: AuthUser, platformId: string) => {
    const companyId = resolveCompanyScope(user);
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const [ordersByStatus, spByStatus, upcomingEvents] = await Promise.all([
        db
            .select({ status: orders.order_status, count: count() })
            .from(orders)
            .where(and(eq(orders.platform_id, platformId), eq(orders.company_id, companyId)))
            .groupBy(orders.order_status),
        db
            .select({ status: selfPickups.self_pickup_status, count: count() })
            .from(selfPickups)
            .where(
                and(eq(selfPickups.platform_id, platformId), eq(selfPickups.company_id, companyId))
            )
            .groupBy(selfPickups.self_pickup_status),
        db
            .select({ count: count() })
            .from(orders)
            .where(
                and(
                    eq(orders.platform_id, platformId),
                    eq(orders.company_id, companyId),
                    gte(orders.event_start_date, now),
                    lte(orders.event_start_date, in30Days),
                    inArray(orders.order_status, [
                        "CONFIRMED",
                        "IN_PREPARATION",
                        "READY_FOR_DELIVERY",
                        "IN_TRANSIT",
                        "DELIVERED",
                        "IN_USE",
                    ])
                )
            ),
    ]);

    const sumFor = (rows: { status: string | null; count: number }[], statuses: string[]) =>
        rows
            .filter((r) => r.status && statuses.includes(r.status))
            .reduce((acc, r) => acc + Number(r.count), 0);

    const totalOrders = ordersByStatus.reduce((acc, r) => acc + Number(r.count), 0);
    const totalSelfPickups = spByStatus.reduce((acc, r) => acc + Number(r.count), 0);

    return {
        orders_by_status: ordersByStatus.map((r) => ({ status: r.status, count: Number(r.count) })),
        self_pickups_by_status: spByStatus.map((r) => ({
            status: r.status,
            count: Number(r.count),
        })),
        totals: {
            orders: totalOrders,
            self_pickups: totalSelfPickups,
            // Awaiting the client's decision — what a manager most wants to see.
            pending_quotes: sumFor(ordersByStatus, ["QUOTED"]) + sumFor(spByStatus, ["QUOTED"]),
            upcoming_events_30d: Number(upcomingEvents[0]?.count || 0),
        },
    };
};

/** Read-only company member list (CLIENT users only). No sensitive fields. */
const listMembers = async (user: AuthUser, platformId: string) => {
    const companyId = resolveCompanyScope(user);
    const members = await db
        .select({
            id: users.id,
            name: users.name,
            email: users.email,
            is_active: users.is_active,
            last_login_at: users.last_login_at,
        })
        .from(users)
        .where(
            and(
                eq(users.platform_id, platformId),
                eq(users.company_id, companyId),
                eq(users.role, "CLIENT")
            )
        )
        .orderBy(users.name);

    return { data: members, meta: { total: members.length } };
};

/**
 * Company-wide cost-estimates list: orders + self-pickups that have reached a
 * status where an estimate has been issued. final_total is the CLIENT sell-side
 * projection. The PDF itself is fetched via the per-entity download endpoint.
 */
const listCostEstimates = async (user: AuthUser, platformId: string) => {
    const companyId = resolveCompanyScope(user);

    const [orderRows, spRows] = await Promise.all([
        db
            .select({
                id: orders.id,
                reference_id: orders.order_id,
                status: orders.order_status,
                contact_name: orders.contact_name,
                created_at: orders.created_at,
                event_start_date: orders.event_start_date,
                created_by_name: users.name,
                pricing: PRICING_COLUMNS,
            })
            .from(orders)
            .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
            .leftJoin(users, eq(orders.created_by, users.id))
            .where(
                and(
                    eq(orders.platform_id, platformId),
                    eq(orders.company_id, companyId),
                    inArray(orders.order_status, [...ESTIMATE_ORDER_STATUSES])
                )
            )
            .orderBy(desc(orders.created_at)),
        db
            .select({
                id: selfPickups.id,
                reference_id: selfPickups.self_pickup_id,
                status: selfPickups.self_pickup_status,
                collector_name: selfPickups.collector_name,
                created_at: selfPickups.created_at,
                created_by_name: users.name,
                pricing: PRICING_COLUMNS,
            })
            .from(selfPickups)
            .leftJoin(prices, eq(selfPickups.self_pickup_pricing_id, prices.id))
            .leftJoin(users, eq(selfPickups.created_by, users.id))
            .where(
                and(
                    eq(selfPickups.platform_id, platformId),
                    eq(selfPickups.company_id, companyId),
                    inArray(selfPickups.self_pickup_status, [...ESTIMATE_SP_STATUSES])
                )
            )
            .orderBy(desc(selfPickups.created_at)),
    ]);

    const orderEstimates = orderRows.map((r) => ({
        entity_type: "ORDER" as const,
        id: r.id,
        reference_id: r.reference_id,
        status: r.status,
        title: r.contact_name,
        created_by_name: r.created_by_name,
        created_at: r.created_at,
        ...PricingService.projectSummaryForRole(r.pricing as any, "CLIENT"),
    }));

    const spEstimates = spRows.map((r) => ({
        entity_type: "SELF_PICKUP" as const,
        id: r.id,
        reference_id: r.reference_id,
        status: r.status,
        title: r.collector_name,
        created_by_name: r.created_by_name,
        created_at: r.created_at,
        ...PricingService.projectSummaryForRole(r.pricing as any, "CLIENT"),
    }));

    const data = [...orderEstimates, ...spEstimates].sort(
        (a, b) => (b.created_at?.getTime() || 0) - (a.created_at?.getTime() || 0)
    );

    return { data, meta: { total: data.length } };
};

/**
 * Resolve a company-scoped entity for cost-estimate download: confirms the
 * order / self-pickup belongs to the caller's company, returns its
 * DocumentService context type + internal id + human reference. Throws 404
 * (not 403) so a cross-company probe can't distinguish "wrong company" from
 * "doesn't exist".
 */
const resolveEstimateTarget = async (
    user: AuthUser,
    platformId: string,
    entityType: "ORDER" | "SELF_PICKUP",
    id: string
): Promise<{ entityId: string; referenceId: string }> => {
    const companyId = resolveCompanyScope(user);
    if (entityType === "ORDER") {
        const [row] = await db
            .select({ id: orders.id, reference_id: orders.order_id, company_id: orders.company_id })
            .from(orders)
            .where(and(eq(orders.id, id), eq(orders.platform_id, platformId)))
            .limit(1);
        if (!row || row.company_id !== companyId) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Cost estimate not found");
        }
        return { entityId: row.id, referenceId: row.reference_id };
    }
    const [row] = await db
        .select({
            id: selfPickups.id,
            reference_id: selfPickups.self_pickup_id,
            company_id: selfPickups.company_id,
        })
        .from(selfPickups)
        .where(and(eq(selfPickups.id, id), eq(selfPickups.platform_id, platformId)))
        .limit(1);
    if (!row || row.company_id !== companyId) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Cost estimate not found");
    }
    return { entityId: row.id, referenceId: row.reference_id };
};

export const CompanyOfficeServices = {
    getDashboardSummary,
    listMembers,
    listCostEstimates,
    resolveEstimateTarget,
};
