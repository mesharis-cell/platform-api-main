import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import httpStatus from "http-status";
import dayjs from "dayjs";
import { randomUUID } from "crypto";
import { db } from "../../../db";
import {
    assets,
    assetBookings,
    brands,
    collections,
    companies,
    platforms,
    prices,
    selfPickupItems,
    selfPickupStatusHistory,
    selfPickups,
    users,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { PricingService } from "../../services/pricing.service";
import { eventBus, EVENT_TYPES } from "../../events";
import { resolveEffectiveFeature } from "../../constants/common";
import { SubmitSelfPickupPayload, SelfPickupListParams } from "./self-pickup.interfaces";
import {
    canCancelSelfPickup,
    canReturnToLogistics,
    canSubmitForApproval,
    canApproveQuote,
    canMarkReadyForPickup,
    canTriggerReturn,
} from "./self-pickup-validation.utils";

// ----------------------------------- STATUS → EVENT MAP ----------------------------------
// Maps a new status to the specific event type that should fire alongside
// the generic SELF_PICKUP_STATUS_CHANGED. Mirrors order.services.ts:1685-1717.
// Transitions not listed here (SUBMITTED at creation, PICKED_UP + CLOSED from
// scanning) are emitted directly by their own services.
const STATUS_TO_EVENT: Record<string, string> = {
    QUOTED: EVENT_TYPES.SELF_PICKUP_QUOTED,
    DECLINED: EVENT_TYPES.SELF_PICKUP_DECLINED,
    CONFIRMED: EVENT_TYPES.SELF_PICKUP_CONFIRMED,
    READY_FOR_PICKUP: EVENT_TYPES.SELF_PICKUP_READY_FOR_PICKUP,
    AWAITING_RETURN: EVENT_TYPES.SELF_PICKUP_RETURN_DUE,
    CANCELLED: EVENT_TYPES.SELF_PICKUP_CANCELLED,
};

// ----------------------------------- ID GENERATOR -----------------------------------------

const selfPickupIdGenerator = async (platformId: string): Promise<string> => {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0].replace(/-/g, ""); // YYYYMMDD

    const prefix = `SPK-${dateStr}-`;
    const todayPickups = await db
        .select({ self_pickup_id: selfPickups.self_pickup_id })
        .from(selfPickups)
        .where(
            and(
                eq(selfPickups.platform_id, platformId),
                sql`${selfPickups.self_pickup_id} LIKE ${prefix + "%"}`
            )
        )
        .orderBy(desc(selfPickups.self_pickup_id))
        .limit(1);

    let sequence = 1;
    if (todayPickups.length > 0) {
        const lastId = todayPickups[0].self_pickup_id;
        const lastSequence = parseInt(lastId.split("-")[2], 10);
        sequence = lastSequence + 1;
    }

    return `${prefix}${sequence.toString().padStart(3, "0")}`;
};

// ----------------------------------- SUBMIT FROM CART -------------------------------------

const submitSelfPickupFromCart = async (
    user: AuthUser,
    companyId: string,
    platformId: string,
    payload: SubmitSelfPickupPayload
) => {
    const {
        items,
        brand_id,
        collector_name,
        collector_phone,
        collector_email,
        pickup_window,
        expected_return_at,
        notes,
        special_instructions,
        job_number,
        po_number,
    } = payload;

    // Step 1: Verify company exists and belongs to the platform
    const [company] = await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, companyId), eq(companies.platform_id, platformId)));

    if (!company) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Company not found");
    }

    const [platform] = await db
        .select({ vat_percent: platforms.vat_percent, features: platforms.features })
        .from(platforms)
        .where(eq(platforms.id, platformId))
        .limit(1);

    // Step 2: Verify and load assets
    const pickupItemsData: Array<{
        platform_id: string;
        asset_id: string;
        asset_name: string;
        quantity: number;
        volume_per_unit: string;
        weight_per_unit: string;
        total_volume: string;
        total_weight: string;
        condition_notes: string | null;
        handling_tags: string[];
        from_collection: string | null;
        from_collection_name: string | null;
    }> = [];
    let totalVolume = 0;
    let totalWeight = 0;

    for (const item of items) {
        const asset = await db.query.assets.findFirst({
            where: and(
                eq(assets.id, item.asset_id),
                eq(assets.platform_id, platformId),
                eq(assets.company_id, companyId)
            ),
        });

        if (!asset) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, `Asset not found: ${item.asset_id}`);
        }

        if (asset.available_quantity < item.quantity) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Insufficient stock for ${asset.name}: available ${asset.available_quantity}, requested ${item.quantity}`
            );
        }

        const itemVolume = parseFloat(asset.volume_per_unit) * item.quantity;
        const itemWeight = parseFloat(asset.weight_per_unit) * item.quantity;
        totalVolume += itemVolume;
        totalWeight += itemWeight;

        let collectionName: string | null = null;
        if (item.from_collection_id) {
            const [collection] = await db
                .select()
                .from(collections)
                .where(
                    and(
                        eq(collections.id, item.from_collection_id),
                        eq(collections.platform_id, platformId)
                    )
                );
            collectionName = collection?.name || null;
        }

        pickupItemsData.push({
            platform_id: platformId,
            asset_id: asset.id,
            asset_name: asset.name,
            quantity: item.quantity,
            volume_per_unit: asset.volume_per_unit,
            weight_per_unit: asset.weight_per_unit,
            total_volume: itemVolume.toFixed(3),
            total_weight: itemWeight.toFixed(2),
            condition_notes: asset.condition_notes,
            handling_tags: asset.handling_tags || [],
            from_collection: item.from_collection_id || null,
            from_collection_name: collectionName,
        });
    }

    const calculatedVolume = totalVolume.toFixed(3);
    const calculatedWeight = totalWeight.toFixed(2);

    // Step 3: Create pricing (same pattern as orders)
    const volume = parseFloat(calculatedVolume);
    const baseOpsTotal = Number(company.warehouse_ops_rate) * volume;
    // Use the canonical feature resolver (company override → platform value →
    // registry default). Reading company.features directly with `?? true`
    // ignored the platform-level flag and defaulted ON — that's the bug that
    // caused BASE_OPS to show up on Red Bull self-pickups even though
    // enable_base_operations was OFF at every level. See CLAUDE.md
    // <feature_flag_discipline>.
    const enableBaseOperations = resolveEffectiveFeature("enable_base_operations", {
        platformFeatures: (platform?.features as Record<string, unknown> | null) || null,
        companyFeatures: (company.features as Record<string, unknown> | null) || null,
    });
    const vatPercent =
        company.vat_percent_override !== null && company.vat_percent_override !== undefined
            ? Number(company.vat_percent_override)
            : Number(platform?.vat_percent || 0);

    const pricingDetails = PricingService.buildInitialPricing({
        platform_id: platformId,
        entity_type: "SELF_PICKUP",
        entity_id: randomUUID(),
        warehouse_ops_rate: company.warehouse_ops_rate,
        base_ops_total: baseOpsTotal,
        margin_percent: Number(company.platform_margin_percent || 0),
        vat_percent: vatPercent,
        calculated_by: user.id,
        volume,
        enable_base_operations: enableBaseOperations,
    });

    // Step 4: Create the self-pickup record in a transaction
    const selfPickupId = await selfPickupIdGenerator(platformId);
    const selfPickupDbId = pricingDetails.entity_id;
    const pickupWindowParsed = {
        start: dayjs(pickup_window.start).toISOString(),
        end: dayjs(pickup_window.end).toISOString(),
    };

    const result = await db.transaction(async (tx) => {
        // 4a: Insert pricing row
        const [pickupPricing] = await tx
            .insert(prices)
            .values(pricingDetails as any)
            .returning();

        // 4b: Insert self_pickup row
        const [pickup] = await tx
            .insert(selfPickups)
            .values({
                id: selfPickupDbId,
                platform_id: platformId,
                self_pickup_id: selfPickupId,
                company_id: companyId,
                brand_id: brand_id || null,
                created_by: user.id,
                collector_name,
                collector_phone,
                collector_email: collector_email || null,
                pickup_window: pickupWindowParsed,
                expected_return_at: expected_return_at ? dayjs(expected_return_at).toDate() : null,
                notes: notes || null,
                special_instructions: special_instructions || null,
                job_number: job_number || null,
                po_number: po_number || null,
                self_pickup_pricing_id: pickupPricing.id,
                calculated_totals: {
                    volume: calculatedVolume,
                    weight: calculatedWeight,
                },
                self_pickup_status: "PRICING_REVIEW",
                financial_status: "PENDING_QUOTE",
            })
            .returning();

        // 4c: Insert self_pickup_items
        const itemsToInsert = pickupItemsData.map((item) => ({
            ...item,
            self_pickup_id: pickup.id,
        }));
        await tx.insert(selfPickupItems).values(itemsToInsert);

        // 4d: Create asset bookings (block inventory for the pickup)
        for (const item of pickupItemsData) {
            // Block from pickup window start to expected return (or pickup end if no return date)
            const blockedUntil = expected_return_at
                ? dayjs(expected_return_at).toDate()
                : dayjs(pickup_window.end).add(7, "day").toDate(); // default 7-day booking window

            await tx.insert(assetBookings).values({
                asset_id: item.asset_id,
                self_pickup_id: pickup.id,
                quantity: item.quantity,
                blocked_from: dayjs(pickup_window.start).toDate(),
                blocked_until: blockedUntil,
            });

            // Deduct available_quantity
            await tx
                .update(assets)
                .set({
                    available_quantity: sql`GREATEST(0, ${assets.available_quantity} - ${item.quantity})`,
                })
                .where(eq(assets.id, item.asset_id));
        }

        // 4e: Status history
        await tx.insert(selfPickupStatusHistory).values({
            platform_id: platformId,
            self_pickup_id: pickup.id,
            status: "PRICING_REVIEW",
            notes: "Self-pickup submitted from cart",
            updated_by: user.id,
        });

        return pickup;
    });

    // Step 5: Rebuild pricing breakdown (needs line items created first in future,
    // same as orders — for now, initial pricing is sufficient)
    await PricingService.rebuildBreakdown({
        entity_type: "SELF_PICKUP",
        entity_id: result.id,
        platform_id: platformId,
        calculated_by: user.id,
        base_ops_total_override: baseOpsTotal,
    });

    // Step 6: Emit event
    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.SELF_PICKUP_SUBMITTED,
        entity_type: "SELF_PICKUP",
        entity_id: result.id,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            entity_id_readable: selfPickupId,
            company_id: companyId,
            company_name: company.name,
            collector_name,
            collector_phone,
            pickup_window: pickupWindowParsed,
            item_count: items.length,
            total_volume: calculatedVolume,
        },
    });

    return {
        self_pickup_id: selfPickupId,
        id: result.id,
        status: "PRICING_REVIEW",
        company_name: company.name,
        calculated_volume: calculatedVolume,
        item_count: items.length,
    };
};

// ----------------------------------- LIST (ADMIN) ----------------------------------------

const listSelfPickups = async (platformId: string, params: SelfPickupListParams) => {
    const {
        page = 1,
        limit = 20,
        company,
        brand,
        self_pickup_status,
        search,
        sortBy = "created_at",
        sortOrder = "desc",
    } = params;

    const conditions = [eq(selfPickups.platform_id, platformId)];
    if (company) conditions.push(eq(selfPickups.company_id, company));
    if (brand) conditions.push(eq(selfPickups.brand_id, brand));
    if (self_pickup_status)
        conditions.push(eq(selfPickups.self_pickup_status, self_pickup_status as any));
    if (search) {
        conditions.push(
            or(
                ilike(selfPickups.self_pickup_id, `%${search}%`),
                ilike(selfPickups.collector_name, `%${search}%`)
            )!
        );
    }

    const where = and(...conditions);
    const offset = (page - 1) * limit;

    const sortColumn =
        sortBy === "self_pickup_status"
            ? selfPickups.self_pickup_status
            : sortBy === "updated_at"
              ? selfPickups.updated_at
              : selfPickups.created_at;
    const orderDir = sortOrder === "asc" ? sql`ASC` : sql`DESC`;

    const [data, totalResult] = await Promise.all([
        db
            .select({
                id: selfPickups.id,
                self_pickup_id: selfPickups.self_pickup_id,
                company_id: selfPickups.company_id,
                company_name: companies.name,
                brand_name: brands.name,
                collector_name: selfPickups.collector_name,
                collector_phone: selfPickups.collector_phone,
                pickup_window: selfPickups.pickup_window,
                expected_return_at: selfPickups.expected_return_at,
                self_pickup_status: selfPickups.self_pickup_status,
                financial_status: selfPickups.financial_status,
                calculated_totals: selfPickups.calculated_totals,
                created_at: selfPickups.created_at,
                updated_at: selfPickups.updated_at,
            })
            .from(selfPickups)
            .leftJoin(companies, eq(selfPickups.company_id, companies.id))
            .leftJoin(brands, eq(selfPickups.brand_id, brands.id))
            .where(where)
            .orderBy(sql`${sortColumn} ${orderDir}`)
            .limit(limit)
            .offset(offset),
        db.select({ count: count() }).from(selfPickups).where(where),
    ]);

    return {
        self_pickups: data,
        total: Number(totalResult[0]?.count || 0),
        page,
        limit,
        total_pages: Math.ceil(Number(totalResult[0]?.count || 0) / limit),
    };
};

// ----------------------------------- GET BY ID -------------------------------------------

const getSelfPickupById = async (selfPickupId: string, platformId: string) => {
    const pickup = await db.query.selfPickups.findFirst({
        where: and(eq(selfPickups.id, selfPickupId), eq(selfPickups.platform_id, platformId)),
        with: {
            company: true,
            brand: true,
            created_by_user: { columns: { id: true, name: true, email: true } },
            self_pickup_pricing: true,
            items: {
                with: {
                    asset: true,
                },
            },
        },
    });

    if (!pickup) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");
    }

    return pickup;
};

// ----------------------------------- STATUS TRANSITIONS ----------------------------------

const transitionStatus = async (
    selfPickupId: string,
    platformId: string,
    user: AuthUser,
    newStatus: string,
    notes?: string,
    extras: Record<string, unknown> = {}
) => {
    const pickup = await db.query.selfPickups.findFirst({
        where: and(eq(selfPickups.id, selfPickupId), eq(selfPickups.platform_id, platformId)),
        with: { company: { columns: { id: true, name: true } } },
    });

    if (!pickup) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");
    }

    await db.transaction(async (tx) => {
        await tx
            .update(selfPickups)
            .set({ self_pickup_status: newStatus as any })
            .where(eq(selfPickups.id, selfPickupId));

        await tx.insert(selfPickupStatusHistory).values({
            platform_id: platformId,
            self_pickup_id: selfPickupId,
            status: newStatus as any,
            notes: notes || null,
            updated_by: user.id,
        });
    });

    // Build the enriched payload once; used by BOTH the specific event and the
    // generic STATUS_CHANGED (the rule-matching layer can key off either).
    const basePayload: Record<string, unknown> = {
        entity_id_readable: pickup.self_pickup_id,
        company_id: pickup.company_id,
        company_name: (pickup as any).company?.name || "N/A",
        collector_name: pickup.collector_name,
        collector_phone: pickup.collector_phone,
        pickup_window: pickup.pickup_window,
        ...extras,
    };

    // Emit the specific event for this transition (if any). Mirrors the
    // order.services.ts:1685-1717 pattern — direct event-keyed rules can match
    // without relying on a payload-conditions filter on STATUS_CHANGED.
    const specificEventType = STATUS_TO_EVENT[newStatus];
    if (specificEventType) {
        await eventBus.emit({
            platform_id: platformId,
            event_type: specificEventType,
            entity_type: "SELF_PICKUP",
            entity_id: selfPickupId,
            actor_id: user.id,
            actor_role: user.role,
            payload: basePayload,
        });
    }

    // Emit the generic STATUS_CHANGED for audit + backward-compat.
    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.SELF_PICKUP_STATUS_CHANGED,
        entity_type: "SELF_PICKUP",
        entity_id: selfPickupId,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            ...basePayload,
            old_status: pickup.self_pickup_status,
            new_status: newStatus,
            notes: notes || "",
        },
    });

    return { self_pickup_id: pickup.self_pickup_id, new_status: newStatus };
};

// Specific transition endpoints for the approval workflow
const submitForApproval = async (id: string, platformId: string, user: AuthUser) => {
    const pickup = await getSelfPickupById(id, platformId);
    if (!canSubmitForApproval(pickup.self_pickup_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot submit for approval in status: ${pickup.self_pickup_status}`
        );
    }
    return transitionStatus(
        id,
        platformId,
        user,
        "PENDING_APPROVAL",
        "Submitted for admin approval"
    );
};

const approveQuote = async (
    id: string,
    platformId: string,
    user: AuthUser,
    payload: { margin_override_percent?: number; margin_override_reason?: string } = {}
) => {
    const pickup = await getSelfPickupById(id, platformId);
    if (!canApproveQuote(pickup.self_pickup_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot approve quote in status: ${pickup.self_pickup_status}`
        );
    }

    const { margin_override_percent, margin_override_reason } = payload;

    // Apply margin override (if provided) via PricingService — mirrors
    // order.services.ts:2456-2470. The recalculation writes the override
    // flag + reason into the prices row and rebuilds breakdown_lines.
    if (margin_override_percent !== undefined) {
        if (!margin_override_reason?.trim()) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Margin override reason is required when overriding the margin"
            );
        }
        await db.transaction(async (tx) => {
            await PricingService.recalculate({
                entity_type: "SELF_PICKUP",
                entity_id: id,
                platform_id: platformId,
                calculated_by: user.id,
                set_margin_override: {
                    percent: margin_override_percent,
                    reason: margin_override_reason || null,
                },
                tx,
            });
        });
    }

    return transitionStatus(
        id,
        platformId,
        user,
        "QUOTED",
        margin_override_percent !== undefined
            ? `Admin approved with margin override (${margin_override_percent}%): ${margin_override_reason}`
            : "Admin approved — quote sent to client",
        {
            margin_override_percent: margin_override_percent ?? null,
            margin_override_reason: margin_override_reason ?? null,
        }
    );
};

const markReadyForPickup = async (id: string, platformId: string, user: AuthUser) => {
    const pickup = await getSelfPickupById(id, platformId);
    if (!canMarkReadyForPickup(pickup.self_pickup_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot mark as ready in status: ${pickup.self_pickup_status}`
        );
    }
    return transitionStatus(id, platformId, user, "READY_FOR_PICKUP", "Ready for collector pickup");
};

const triggerReturn = async (id: string, platformId: string, user: AuthUser) => {
    const pickup = await getSelfPickupById(id, platformId);
    if (!canTriggerReturn(pickup.self_pickup_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot trigger return in status: ${pickup.self_pickup_status}`
        );
    }
    return transitionStatus(id, platformId, user, "AWAITING_RETURN", "Return initiated");
};

const cancelSelfPickup = async (
    id: string,
    platformId: string,
    user: AuthUser,
    payload: { reason: string; notes?: string; notify_client?: boolean }
) => {
    const pickup = await getSelfPickupById(id, platformId);
    if (!canCancelSelfPickup(pickup.self_pickup_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot cancel in status: ${pickup.self_pickup_status}`
        );
    }

    // Release bookings on cancellation
    const { releaseBookingsAndRestoreAvailability } = await import("../order/order.utils");
    await db.transaction(async (tx) => {
        await releaseBookingsAndRestoreAvailability(tx, "SELF_PICKUP", id, platformId);
    });

    const statusHistoryNote = payload.notes?.trim()
        ? `Cancelled (${payload.reason}): ${payload.notes.trim()}`
        : `Cancelled: ${payload.reason}`;

    return transitionStatus(id, platformId, user, "CANCELLED", statusHistoryNote, {
        cancellation_reason: payload.reason,
        cancellation_notes: payload.notes?.trim() || null,
        notify_client: payload.notify_client ?? true,
    });
};

// Client-specific transitions
const clientApproveQuote = async (
    id: string,
    platformId: string,
    user: AuthUser,
    payload: { po_number: string; notes?: string }
) => {
    const pickup = await getSelfPickupById(id, platformId);
    if (pickup.self_pickup_status !== "QUOTED") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Can only approve a quoted self-pickup");
    }

    // Persist po_number so it's available on the row for invoicing + audit.
    await db
        .update(selfPickups)
        .set({ po_number: payload.po_number })
        .where(and(eq(selfPickups.id, id), eq(selfPickups.platform_id, platformId)));

    return transitionStatus(
        id,
        platformId,
        user,
        "CONFIRMED",
        payload.notes ? `Client approved quote: ${payload.notes}` : "Client approved quote",
        { po_number: payload.po_number }
    );
};

const clientDeclineQuote = async (
    id: string,
    platformId: string,
    user: AuthUser,
    payload: { decline_reason: string }
) => {
    const pickup = await getSelfPickupById(id, platformId);
    if (pickup.self_pickup_status !== "QUOTED") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Can only decline a quoted self-pickup");
    }

    await db
        .update(selfPickups)
        .set({ decline_reason: payload.decline_reason })
        .where(and(eq(selfPickups.id, id), eq(selfPickups.platform_id, platformId)));

    return transitionStatus(
        id,
        platformId,
        user,
        "DECLINED",
        `Client declined quote: ${payload.decline_reason}`,
        { decline_reason: payload.decline_reason }
    );
};

// Admin can send a pricing-review-complete pickup back to logistics with a reason.
const returnToLogistics = async (
    id: string,
    platformId: string,
    user: AuthUser,
    payload: { reason: string }
) => {
    const pickup = await getSelfPickupById(id, platformId);
    if (!canReturnToLogistics(pickup.self_pickup_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot return to logistics in status: ${pickup.self_pickup_status}`
        );
    }
    return transitionStatus(
        id,
        platformId,
        user,
        "PRICING_REVIEW",
        `Returned to logistics: ${payload.reason}`,
        { return_reason: payload.reason }
    );
};

// ----------------------------------- STATUS HISTORY --------------------------------------

const getStatusHistory = async (selfPickupId: string, platformId: string) => {
    const history = await db
        .select({
            id: selfPickupStatusHistory.id,
            status: selfPickupStatusHistory.status,
            notes: selfPickupStatusHistory.notes,
            updated_by: selfPickupStatusHistory.updated_by,
            updated_by_name: users.name,
            timestamp: selfPickupStatusHistory.timestamp,
        })
        .from(selfPickupStatusHistory)
        .leftJoin(users, eq(selfPickupStatusHistory.updated_by, users.id))
        .where(
            and(
                eq(selfPickupStatusHistory.self_pickup_id, selfPickupId),
                eq(selfPickupStatusHistory.platform_id, platformId)
            )
        )
        .orderBy(desc(selfPickupStatusHistory.timestamp));

    return history;
};

// ----------------------------------- CLIENT LIST -----------------------------------------

const listClientSelfPickups = async (
    platformId: string,
    companyId: string,
    userId: string,
    params: SelfPickupListParams
) => {
    const { page = 1, limit = 20, self_pickup_status, search } = params;

    const conditions = [
        eq(selfPickups.platform_id, platformId),
        eq(selfPickups.company_id, companyId),
        eq(selfPickups.created_by, userId),
    ];

    if (self_pickup_status)
        conditions.push(eq(selfPickups.self_pickup_status, self_pickup_status as any));
    if (search) conditions.push(ilike(selfPickups.self_pickup_id, `%${search}%`));

    const where = and(...conditions);
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
        db
            .select()
            .from(selfPickups)
            .where(where)
            .orderBy(desc(selfPickups.created_at))
            .limit(limit)
            .offset(offset),
        db.select({ count: count() }).from(selfPickups).where(where),
    ]);

    return {
        self_pickups: data,
        total: Number(totalResult[0]?.count || 0),
        page,
        limit,
        total_pages: Math.ceil(Number(totalResult[0]?.count || 0) / limit),
    };
};

// ----------------------------------- UPDATE JOB NUMBER -----------------------------------

const updateJobNumber = async (
    id: string,
    platformId: string,
    user: AuthUser,
    jobNumber: string | null
) => {
    await db
        .update(selfPickups)
        .set({ job_number: jobNumber })
        .where(and(eq(selfPickups.id, id), eq(selfPickups.platform_id, platformId)));

    return { job_number: jobNumber };
};

// ----------------------------------- EXPORTS ---------------------------------------------

export const SelfPickupServices = {
    submitSelfPickupFromCart,
    listSelfPickups,
    getSelfPickupById,
    getStatusHistory,
    submitForApproval,
    approveQuote,
    markReadyForPickup,
    triggerReturn,
    cancelSelfPickup,
    clientApproveQuote,
    clientDeclineQuote,
    returnToLogistics,
    clientListSelfPickups: listClientSelfPickups,
    updateJobNumber,
};
