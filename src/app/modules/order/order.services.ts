import dayjs from "dayjs";
import { randomUUID } from "crypto";
import {
    and,
    asc,
    count,
    desc,
    eq,
    gte,
    ilike,
    inArray,
    isNull,
    lte,
    notInArray,
    or,
    sql,
} from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    assetBookings,
    assets,
    brands,
    cities,
    collections,
    companies,
    financialStatusHistory,
    invoices,
    prices,
    orderTransportTrips,
    orders,
    orderStatusHistory,
    platforms,
    serviceRequestItems,
    serviceRequestStatusHistory,
    serviceRequests,
    scanEventAssets,
    scanEventMedia,
    scanEvents,
    users,
    countries,
    orderItems,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import paginationMaker from "../../utils/pagination-maker";
import { buildServiceRequestCodes } from "../../utils/service-request-code";
import queryValidator from "../../utils/query-validator";
import {
    SubmitOrderPayload,
    UpdateOrderTimeWindowsPayload,
    ProgressStatusPayload,
    ApproveQuotePayload,
    DeclineQuotePayload,
    OrderItem,
    CancelOrderPayload,
    CalculateEstimatePayload,
    AdminApproveQuotePayload,
    CheckMaintenanceFeasibilityPayload,
    UpdateMaintenanceDecisionPayload,
} from "./order.interfaces";
import {
    checkAssetsForOrder,
    isValidTransition,
    NON_CANCELLABLE_STATUSES,
    orderQueryValidationConfig,
    orderSortableFields,
    PREP_BUFFER_DAYS,
    RETURN_BUFFER_DAYS,
    releaseOrderBookingsAndRestoreAvailability,
    validateInboundScanningComplete,
    validateRoleBasedTransition,
} from "./order.utils";
import { LineItemsServices } from "../order-line-items/order-line-items.services";
import { eventBus, EVENT_TYPES } from "../../events";
import { orderIdGenerator } from "./order.utils";
import { featureNames, uuidRegex } from "../../constants/common";
import config from "../../config";
import { formatDateForEmail } from "../../utils/date-time";
import { DocumentService } from "../../services/document.service";
import { GoodsFormType, generateGoodsFormXlsx } from "../../utils/goods-form-xlsx";
import { PricingService } from "../../services/pricing.service";
import { validateMaintenanceFeasibilityForAssets } from "./order-feasibility.utils";

const FULFILLMENT_READINESS_STATUSES = new Set([
    "IN_PREPARATION",
    "READY_FOR_DELIVERY",
    "IN_TRANSIT",
    "DELIVERED",
    "IN_USE",
    "DERIG",
    "AWAITING_RETURN",
    "RETURN_IN_TRANSIT",
    "CLOSED",
]);

const isClientPoRequiredForQuoteApproval = async (
    platformId: string,
    companyFeatures: unknown
) => {
    const [platform] = await db
        .select({ features: platforms.features })
        .from(platforms)
        .where(eq(platforms.id, platformId))
        .limit(1);

    const platformRaw = (platform?.features || {}) as Record<string, unknown>;
    const companyRaw = (companyFeatures || {}) as Record<string, unknown>;
    const featureName = featureNames.require_client_po_number_on_quote_approval;

    const platformEnabled =
        platformRaw[featureName] === undefined ? true : Boolean(platformRaw[featureName]);

    return Object.prototype.hasOwnProperty.call(companyRaw, featureName)
        ? Boolean(companyRaw[featureName])
        : platformEnabled;
};

const getLinkedServiceRequestSummaries = async (
    orderDbId: string,
    platformId: string,
    role: AuthUser["role"]
) => {
    const rows = await db
        .select({
            id: serviceRequests.id,
            service_request_id: serviceRequests.service_request_id,
            request_type: serviceRequests.request_type,
            billing_mode: serviceRequests.billing_mode,
            link_mode: serviceRequests.link_mode,
            blocks_fulfillment: serviceRequests.blocks_fulfillment,
            request_status: serviceRequests.request_status,
            commercial_status: serviceRequests.commercial_status,
            related_order_item_id: serviceRequests.related_order_item_id,
            related_asset_id: serviceRequests.related_asset_id,
            client_sell_override_total: serviceRequests.client_sell_override_total,
            concession_applied_at: serviceRequests.concession_applied_at,
            request_pricing_id: serviceRequests.request_pricing_id,
            pricing: {
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
            },
        })
        .from(serviceRequests)
        .leftJoin(prices, eq(serviceRequests.request_pricing_id, prices.id))
        .where(
            and(
                eq(serviceRequests.platform_id, platformId),
                eq(serviceRequests.related_order_id, orderDbId)
            )
        )
        .orderBy(desc(serviceRequests.created_at));

    return rows.map((row) => {
        const projected = PricingService.projectSummaryForRole(row.pricing as any, "CLIENT");
        const clientTotal =
            row.client_sell_override_total !== null && row.client_sell_override_total !== undefined
                ? String(row.client_sell_override_total)
                : String(projected?.final_total || "0");
        return {
            id: row.id,
            service_request_id: row.service_request_id,
            request_type: row.request_type,
            billing_mode: row.billing_mode,
            link_mode: row.link_mode,
            blocks_fulfillment: row.blocks_fulfillment,
            request_status: row.request_status,
            commercial_status: row.commercial_status,
            related_order_item_id: row.related_order_item_id,
            related_asset_id: row.related_asset_id,
            is_concession_applied: !!row.concession_applied_at,
            total: role === "LOGISTICS" ? null : clientTotal,
            request_pricing_id: row.request_pricing_id,
        };
    });
};

const hasUnresolvedBlockingServiceRequests = async (orderDbId: string, platformId: string) => {
    const blocking = await db
        .select({
            request_status: serviceRequests.request_status,
            concession_applied_at: serviceRequests.concession_applied_at,
        })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.platform_id, platformId),
                eq(serviceRequests.related_order_id, orderDbId),
                eq(serviceRequests.blocks_fulfillment, true)
            )
        );

    return blocking.some((request) => {
        if (request.concession_applied_at) return false;
        return !["COMPLETED", "CANCELLED"].includes(request.request_status);
    });
};

const getUnresolvedMaintenanceReadinessItems = async (orderDbId: string, platformId: string) => {
    const items = await db
        .select({
            id: orderItems.id,
            asset_name: orderItems.asset_name,
            requires_maintenance: orderItems.requires_maintenance,
            maintenance_decision: orderItems.maintenance_decision,
        })
        .from(orderItems)
        .where(and(eq(orderItems.order_id, orderDbId), eq(orderItems.platform_id, platformId)));

    const candidateItems = items.filter(
        (item) => item.requires_maintenance && item.maintenance_decision !== "USE_AS_IS"
    );

    if (candidateItems.length === 0) {
        return [];
    }

    const serviceRequestRows = await db
        .select({
            related_order_item_id: serviceRequests.related_order_item_id,
            request_status: serviceRequests.request_status,
            concession_applied_at: serviceRequests.concession_applied_at,
        })
        .from(serviceRequests)
        .where(
            and(
                eq(serviceRequests.platform_id, platformId),
                eq(serviceRequests.related_order_id, orderDbId),
                eq(serviceRequests.request_type, "MAINTENANCE")
            )
        );

    return candidateItems.filter((item) => {
        const linkedRequests = serviceRequestRows.filter(
            (request) => request.related_order_item_id === item.id
        );

        if (linkedRequests.length === 0) {
            return true;
        }

        return linkedRequests.some((request) => {
            if (request.concession_applied_at) return false;
            return !["COMPLETED", "CANCELLED"].includes(request.request_status);
        });
    });
};

const autoApproveBundledServiceRequests = async (
    orderDbId: string,
    platformId: string,
    actor: AuthUser
) => {
    const bundled = await db
        .select({
            id: serviceRequests.id,
            service_request_id: serviceRequests.service_request_id,
            company_id: serviceRequests.company_id,
            request_status: serviceRequests.request_status,
            commercial_status: serviceRequests.commercial_status,
            request_pricing_id: serviceRequests.request_pricing_id,
            client_sell_override_total: serviceRequests.client_sell_override_total,
            related_order_id: serviceRequests.related_order_id,
            request_type: serviceRequests.request_type,
            billing_mode: serviceRequests.billing_mode,
            company_name: companies.name,
            pricing: {
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
            },
        })
        .from(serviceRequests)
        .leftJoin(companies, eq(serviceRequests.company_id, companies.id))
        .leftJoin(prices, eq(serviceRequests.request_pricing_id, prices.id))
        .where(
            and(
                eq(serviceRequests.platform_id, platformId),
                eq(serviceRequests.related_order_id, orderDbId),
                eq(serviceRequests.link_mode, "BUNDLED_WITH_ORDER"),
                eq(serviceRequests.billing_mode, "CLIENT_BILLABLE")
            )
        );

    for (const request of bundled) {
        if (["QUOTE_APPROVED", "INVOICED", "PAID"].includes(request.commercial_status)) continue;
        await db
            .update(serviceRequests)
            .set({
                commercial_status: "QUOTE_APPROVED",
                updated_at: new Date(),
            })
            .where(eq(serviceRequests.id, request.id));

        await db.insert(serviceRequestStatusHistory).values({
            service_request_id: request.id,
            platform_id: platformId,
            from_status: request.request_status,
            to_status: request.request_status,
            note: "Commercial status auto-approved with linked order quote approval",
            changed_by: actor.id,
        });

        const finalTotal =
            request.client_sell_override_total !== null &&
            request.client_sell_override_total !== undefined
                ? String(request.client_sell_override_total)
                : String(
                      PricingService.projectSummaryForRole(request.pricing as any, "CLIENT")
                          ?.final_total || "0"
                  );

        await eventBus.emit({
            platform_id: platformId,
            event_type: EVENT_TYPES.SERVICE_REQUEST_APPROVED,
            entity_type: "SERVICE_REQUEST",
            entity_id: request.id,
            actor_id: actor.id,
            actor_role: actor.role,
            payload: {
                entity_id_readable: request.service_request_id,
                company_id: request.company_id,
                company_name: request.company_name || "N/A",
                contact_name: "Client",
                final_total: finalTotal,
                request_url: "",
            },
        });
    }
};

// ----------------------------------- CALCULATE ESTIMATE -------------------------------------
const calculateEstimate = async (
    _platformId: string,
    _companyId: string,
    _payload: CalculateEstimatePayload
) => {
    return { available: false, message: "Estimates are not currently available" };
};

// -------------------------------- CHECK MAINTENANCE FEASIBILITY -----------------------------
const checkMaintenanceFeasibility = async (
    platformId: string,
    companyId: string | null,
    payload: CheckMaintenanceFeasibilityPayload
): Promise<{
    feasible: boolean;
    issues: {
        asset_id: string;
        asset_name: string;
        refurb_days_estimate: number;
        earliest_feasible_date: string;
        condition: "RED" | "ORANGE";
        maintenance_mode: "MANDATORY_RED" | "OPTIONAL_ORANGE_FIX";
        message: string;
    }[];
    config: {
        minimum_lead_hours: number;
        exclude_weekends: boolean;
        weekend_days: number[];
        timezone: string;
    };
}> => {
    const feasibility = await validateMaintenanceFeasibilityForAssets(
        platformId,
        companyId,
        payload.items,
        payload.event_start_date
    );

    return {
        feasible: feasibility.feasible,
        issues: feasibility.issues,
        config: feasibility.config,
    };
};

// ----------------------------------- SUBMIT ORDER FROM CART ---------------------------------
const submitOrderFromCart = async (
    user: AuthUser,
    companyId: string,
    platformId: string,
    payload: SubmitOrderPayload
): Promise<{
    order_id: string;
    status: string;
    company_name: string;
    calculated_volume: string;
    item_count: number;
}> => {
    // Step 1: Extract payload and setup variables
    const {
        items,
        brand_id,
        event_start_date,
        event_end_date,
        venue_name,
        venue_country_id,
        venue_city_id,
        venue_address,
        contact_name,
        contact_email,
        contact_phone,
        venue_access_notes,
        permit_requirements,
        special_instructions,
    } = payload;

    const eventStartDate = dayjs(event_start_date).toDate();
    const eventEndDate = dayjs(event_end_date).toDate();

    // Step 2: Verify company exists and belongs to the platform
    const [company] = await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, companyId), eq(companies.platform_id, platformId)));

    if (!company) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Company not found");
    }

    const [platform] = await db
        .select({ vat_percent: platforms.vat_percent })
        .from(platforms)
        .where(eq(platforms.id, platformId))
        .limit(1);

    const companyFeatures = (company.features as Record<string, unknown>) || {};
    if (companyFeatures.enable_ordering === false) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Order creation is disabled for this company"
        );
    }

    const [country] = await db
        .select()
        .from(countries)
        .where(and(eq(countries.id, venue_country_id), eq(countries.platform_id, platformId)));

    if (!country) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Country not found");
    }

    const [city] = await db
        .select()
        .from(cities)
        .where(
            and(
                eq(cities.id, venue_city_id),
                eq(cities.platform_id, platformId),
                eq(cities.country_id, venue_country_id)
            )
        );

    if (!city) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "City not found for the given country");
    }

    // Step 3: Check assets availability
    const requiredAssets = items.map((i) => ({ id: i.asset_id, quantity: i.quantity }));
    const foundAssets: any[] = await checkAssetsForOrder(
        platformId,
        companyId,
        requiredAssets,
        eventStartDate,
        eventEndDate
    );

    const maintenanceFeasibility = await validateMaintenanceFeasibilityForAssets(
        platformId,
        companyId,
        items.map((item) => ({
            asset_id: item.asset_id,
            maintenance_decision: item.maintenance_decision,
        })),
        eventStartDate
    );

    if (!maintenanceFeasibility.feasible) {
        const details = maintenanceFeasibility.issues
            .map((issue) => `${issue.asset_name}: earliest ${issue.earliest_feasible_date}`)
            .join("; ");
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Maintenance timeline is not feasible for selected event date. ${details}`
        );
    }

    // Step 4: Calculate order totals (volume and weight)
    const orderItemsData: OrderItem[] = [];
    let totalVolume = 0;
    let totalWeight = 0;
    const decisionLockedAt = new Date();

    for (const item of items) {
        const asset = foundAssets.find((a) => a.id === item.asset_id)!;
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

        const requestedDecision = item.maintenance_decision ?? null;
        let maintenanceDecision: "FIX_IN_ORDER" | "USE_AS_IS" | null = null;

        if (asset.condition === "ORANGE") {
            if (!requestedDecision) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    `Maintenance decision is required for ORANGE asset: ${asset.name}`
                );
            }
            maintenanceDecision = requestedDecision;
        } else if (asset.condition === "RED") {
            if (requestedDecision === "USE_AS_IS") {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    `RED asset cannot be submitted as-is: ${asset.name}`
                );
            }
            maintenanceDecision = "FIX_IN_ORDER";
        } else if (requestedDecision) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Maintenance decision is only allowed for ORANGE or RED assets: ${asset.name}`
            );
        }

        const requiresMaintenance =
            asset.condition === "RED" || maintenanceDecision === "FIX_IN_ORDER";
        const maintenanceRefurbDaysSnapshot = requiresMaintenance
            ? Number(asset.refurb_days_estimate || 0)
            : null;

        orderItemsData.push({
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
            maintenance_decision: maintenanceDecision,
            requires_maintenance: requiresMaintenance,
            maintenance_refurb_days_snapshot: maintenanceRefurbDaysSnapshot,
            maintenance_decision_locked_at: maintenanceDecision ? decisionLockedAt : null,
        });
    }

    const calculatedVolume = totalVolume.toFixed(3);
    const calculatedWeight = totalWeight.toFixed(2);

    // Step 5: Create base pricing without transport; transport is now explicit line items.
    const volume = parseFloat(calculatedVolume);
    const baseOpsTotal = Number(company.warehouse_ops_rate) * volume;
    const companyFeatureFlags = (company.features as Record<string, unknown> | null) || {};
    const enableBaseOperations =
        (companyFeatureFlags.enable_base_operations as boolean | undefined) ?? true;
    const vatPercent =
        company.vat_percent_override !== null && company.vat_percent_override !== undefined
            ? Number(company.vat_percent_override)
            : Number(platform?.vat_percent || 0);
    const pricingDetails = PricingService.buildInitialPricing({
        platform_id: platformId,
        entity_type: "ORDER",
        entity_id: randomUUID(),
        warehouse_ops_rate: company.warehouse_ops_rate,
        base_ops_total: baseOpsTotal,
        margin_percent: Number(company.platform_margin_percent || 0),
        vat_percent: vatPercent,
        calculated_by: user.id,
        volume,
        enable_base_operations: enableBaseOperations,
    });

    // Pre-generate SR codes outside the transaction to avoid READ COMMITTED duplicate-code issue
    // (in-transaction inserts aren't visible to COUNT queries in the same transaction)
    const maintenanceItems = orderItemsData.filter((item) => item.requires_maintenance);
    const srCodes =
        maintenanceItems.length > 0
            ? await buildServiceRequestCodes(platformId, maintenanceItems.length)
            : [];

    // Step 6: Create the order record
    const orderId = await orderIdGenerator(platformId);
    const orderResult = await db.transaction(async (tx) => {
        // Step 6.a: Insert order pricing
        const orderDbId = pricingDetails.entity_id;
        const [orderPricing] = await tx
            .insert(prices)
            .values(pricingDetails as any)
            .returning();

        // Step 6.b: Create the order record
        const [order] = await tx
            .insert(orders)
            .values({
                id: orderDbId,
                platform_id: platformId,
                order_id: orderId,
                company_id: companyId,
                brand_id: brand_id || null,
                created_by: user.id,
                contact_name: contact_name,
                contact_email: contact_email,
                contact_phone: contact_phone,
                event_start_date: eventStartDate,
                event_end_date: eventEndDate,
                venue_name: venue_name,
                venue_location: {
                    country: country.name,
                    address: venue_address,
                    access_notes: venue_access_notes || null,
                },
                permit_requirements:
                    permit_requirements?.requires_permit === true ? permit_requirements : null,
                special_instructions: special_instructions || null,
                calculated_totals: {
                    volume: calculatedVolume,
                    weight: calculatedWeight,
                },
                order_pricing_id: orderPricing.id,
                venue_city_id: venue_city_id,
                order_status: "PRICING_REVIEW",
                financial_status: "PENDING_QUOTE",
            })
            .returning();

        // Step 6.c: Insert order items
        const itemsToInsert = orderItemsData.map((item) => ({
            ...item,
            order_id: order.id,
        }));
        const insertedItems = await tx.insert(orderItems).values(itemsToInsert).returning();

        // Step 6.d: Auto-create MAINTENANCE SRs for RED and ORANGE FIX_IN_ORDER items
        let srCodeIndex = 0;
        for (const insertedItem of insertedItems) {
            if (!insertedItem.requires_maintenance) continue;
            const asset = foundAssets.find((a) => a.id === insertedItem.asset_id)!;

            const [sr] = await tx
                .insert(serviceRequests)
                .values({
                    service_request_id: srCodes[srCodeIndex++],
                    platform_id: platformId,
                    company_id: companyId,
                    request_type: "MAINTENANCE",
                    billing_mode: "INTERNAL_ONLY",
                    link_mode: "BUNDLED_WITH_ORDER",
                    blocks_fulfillment: true,
                    request_status: "SUBMITTED",
                    commercial_status: "INTERNAL",
                    title: `Maintenance — ${asset.name}`,
                    description: asset.condition_notes || null,
                    related_asset_id: asset.id,
                    related_order_id: order.id,
                    related_order_item_id: insertedItem.id,
                    created_by: user.id,
                })
                .returning();

            await tx.insert(serviceRequestItems).values({
                service_request_id: sr.id,
                asset_id: asset.id,
                asset_name: asset.name,
                quantity: insertedItem.quantity,
                refurb_days_estimate: insertedItem.maintenance_refurb_days_snapshot ?? null,
            });

            // No SERVICE_REQUEST_SUBMITTED event — ORDER_SUBMITTED covers the notification
            await tx.insert(serviceRequestStatusHistory).values({
                service_request_id: sr.id,
                platform_id: platformId,
                from_status: null,
                to_status: "SUBMITTED",
                note: "Auto-created on order submission",
                changed_by: user.id,
            });
        }

        // Step 6.e: Insert order status history
        await tx.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: order.id,
            status: "PRICING_REVIEW",
            notes: `Order created`,
            updated_by: user.id,
        });

        return order;
    });

    await PricingService.rebuildBreakdown({
        entity_type: "ORDER",
        entity_id: orderResult.id,
        platform_id: platformId,
        calculated_by: user.id,
        base_ops_total_override: baseOpsTotal,
    });

    // Step 7: Emit order.submitted event
    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.ORDER_SUBMITTED,
        entity_type: "ORDER",
        entity_id: orderResult.id,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            entity_id_readable: orderResult.order_id,
            company_id: companyId,
            company_name: (company as any)?.name || "N/A",
            contact_name: contact_name,
            contact_email: contact_email,
            event_start_date: formatDateForEmail(event_start_date),
            event_end_date: formatDateForEmail(event_end_date),
            venue_name: venue_name,
            venue_city: city.name,
            item_count: items.length,
            total_volume: calculatedVolume,
            order_url: "",
        },
    });

    // Step 8: Return order details to client
    return {
        order_id: orderResult.order_id,
        status: orderResult.order_status,
        company_name: company?.name || "",
        calculated_volume: calculatedVolume,
        item_count: items.length,
    };
};

// ----------------------------------- GET ORDERS ---------------------------------------------
const getOrders = async (query: Record<string, any>, user: AuthUser, platformId: string) => {
    const {
        search_term,
        page,
        limit,
        sort_by,
        sort_order,
        company_id,
        brand_id,
        order_status,
        financial_status,
        date_from,
        date_to,
    } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(orderQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(orderQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } = paginationMaker({
        page,
        limit,
        sort_by,
        sort_order,
    });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(orders.platform_id, platformId)];

    // Step 3a: Filter by user role (CLIENT users see only their company's orders)
    if (user.role === "CLIENT") {
        if (user.company_id) {
            conditions.push(eq(orders.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3b: Optional filters
    if (user.role !== "CLIENT" && company_id) {
        conditions.push(eq(orders.company_id, company_id));
    }

    if (brand_id) {
        conditions.push(eq(orders.brand_id, brand_id));
    }

    if (order_status) {
        queryValidator(orderQueryValidationConfig, "order_status", order_status);
        conditions.push(eq(orders.order_status, order_status));
    }

    if (financial_status) {
        queryValidator(orderQueryValidationConfig, "financial_status", financial_status);
        conditions.push(eq(orders.financial_status, financial_status));
    }

    if (date_from) {
        const fromDate = new Date(date_from);
        if (isNaN(fromDate.getTime())) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date_from format");
        }
        conditions.push(gte(orders.created_at, fromDate));
    }

    if (date_to) {
        const toDate = new Date(date_to);
        if (isNaN(toDate.getTime())) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date_to format");
        }
        conditions.push(lte(orders.created_at, toDate));
    }

    // Step 3c: Search functionality
    if (search_term) {
        const searchConditions = [
            ilike(orders.order_id, `%${search_term}%`),
            ilike(orders.contact_name, `%${search_term}%`),
            ilike(orders.venue_name, `%${search_term}%`),
            // Subquery for asset names in orderItems
            sql`EXISTS (
				SELECT 1 FROM ${orderItems}
				WHERE ${orderItems.order_id} = ${orders.id}
				AND ${orderItems.asset_name} ILIKE ${`%${search_term}%`}
			)`,
        ];
        conditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
    }

    // Step 4: Determine sort field
    const sortField = orderSortableFields[sortWith] || orders.created_at;

    // Step 5: Fetch orders with company and brand information
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
            },
            venue_city: {
                name: cities.name,
            },
            order_pricing: {
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(brands, eq(orders.brand_id, brands.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .leftJoin(cities, eq(orders.venue_city_id, cities.id))
        .where(and(...conditions))
        .orderBy(sortSequence === "asc" ? asc(sortField) : desc(sortField))
        .limit(limitNumber)
        .offset(skip);

    // Step 6: Get total count
    const [countResult] = await db
        .select({ count: count() })
        .from(orders)
        .where(and(...conditions));

    // Step 7: Get item counts for each order
    const orderIds = results.map((r) => r.order.id);
    let itemCounts: Record<string, number> = {};
    let itemPreviews: Record<string, string[]> = {};

    if (orderIds.length > 0) {
        const itemResults = await db
            .select({
                order_id: orderItems.order_id,
                asset_name: orderItems.asset_name,
            })
            .from(orderItems)
            .where(inArray(orderItems.order_id, orderIds));

        // Group by order_id
        itemResults.forEach((item) => {
            if (!itemCounts[item.order_id]) {
                itemCounts[item.order_id] = 0;
                itemPreviews[item.order_id] = [];
            }
            itemCounts[item.order_id]++;
            if (itemPreviews[item.order_id].length < 3) {
                itemPreviews[item.order_id].push(item.asset_name);
            }
        });
    }

    // Step 8: Map results
    const isClient = user.role === "CLIENT";
    const ordersData = results.map((r) => ({
        id: r.order.id,
        order_id: r.order.order_id,
        company: isClient ? { ...r.company, platform_margin_percent: undefined } : r.company,
        brand: r.brand,
        created_by: r.order.created_by,
        job_number: r.order.job_number,
        po_number: r.order.po_number,
        contact_name: r.order.contact_name,
        contact_email: r.order.contact_email,
        contact_phone: r.order.contact_phone,
        event_start_date: r.order.event_start_date,
        event_end_date: r.order.event_end_date,
        venue_name: r.order.venue_name,
        venue_city: r.venue_city?.name || null,
        venue_location: r.order.venue_location,
        calculated_totals: r.order.calculated_totals,
        order_status: r.order.order_status,
        financial_status: r.order.financial_status,
        item_count: itemCounts[r.order.id] || 0,
        item_preview: itemPreviews[r.order.id] || [],
        order_pricing: PricingService.projectSummaryForRole(r.order_pricing, user.role),
        created_at: r.order.created_at,
        updated_at: r.order.updated_at,
    }));

    return {
        data: ordersData,
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: countResult.count,
        },
    };
};

// ----------------------------------- GET MY ORDERS ------------------------------------------
const getMyOrders = async (query: Record<string, any>, user: AuthUser, platformId: string) => {
    const {
        search_term,
        page,
        limit,
        sort_by,
        sort_order,
        brand_id,
        order_status,
        financial_status,
        date_from,
        date_to,
    } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(orderQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(orderQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } = paginationMaker({
        page,
        limit,
        sort_by,
        sort_order,
    });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(orders.platform_id, platformId), eq(orders.created_by, user.id)];

    // Step 3a: Filter by user role (CLIENT users see only their company's orders)
    if (user.role === "CLIENT") {
        if (user.company_id) {
            conditions.push(eq(orders.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    if (brand_id) {
        conditions.push(eq(orders.brand_id, brand_id));
    }

    if (order_status) {
        queryValidator(orderQueryValidationConfig, "order_status", order_status);
        conditions.push(eq(orders.order_status, order_status));
    }

    if (financial_status) {
        queryValidator(orderQueryValidationConfig, "financial_status", financial_status);
        conditions.push(eq(orders.financial_status, financial_status));
    }

    if (date_from) {
        const fromDate = new Date(date_from);
        if (isNaN(fromDate.getTime())) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date_from format");
        }
        conditions.push(gte(orders.created_at, fromDate));
    }

    if (date_to) {
        const toDate = new Date(date_to);
        if (isNaN(toDate.getTime())) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date_to format");
        }
        conditions.push(lte(orders.created_at, toDate));
    }

    // Step 3c: Search functionality
    if (search_term) {
        const searchConditions = [
            ilike(orders.order_id, `%${search_term}%`),
            ilike(orders.contact_name, `%${search_term}%`),
            ilike(orders.venue_name, `%${search_term}%`),
            // Subquery for asset names in orderItems
            sql`EXISTS (
				SELECT 1 FROM ${orderItems}
				WHERE ${orderItems.order_id} = ${orders.id}
				AND ${orderItems.asset_name} ILIKE ${`%${search_term}%`}
			)`,
        ];
        conditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
    }

    // Step 4: Determine sort field
    const sortField = orderSortableFields[sortWith] || orders.created_at;

    // Step 5: Fetch orders with company and brand information
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
            },
            venue_city: {
                name: cities.name,
            },
            order_pricing: {
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(brands, eq(orders.brand_id, brands.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .leftJoin(cities, eq(orders.venue_city_id, cities.id))
        .where(and(...conditions))
        .orderBy(sortSequence === "asc" ? asc(sortField) : desc(sortField))
        .limit(limitNumber)
        .offset(skip);

    // Step 6: Get total count
    const [countResult] = await db
        .select({ count: count() })
        .from(orders)
        .where(and(...conditions));

    const formattedData = results.map((r) => ({
        ...r.order,
        venue_city: r.venue_city?.name || null,
        company: { ...r.company, platform_margin_percent: undefined },
        brand: r.brand,
        order_pricing: PricingService.projectSummaryForRole(r.order_pricing, "CLIENT"),
    }));

    return {
        data: formattedData,
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: countResult.count,
        },
    };
};

// ----------------------------------- GET ORDER BY ID ----------------------------------------
const getOrderById = async (
    orderId: string,
    user: AuthUser,
    platformId: string,
    query: Record<string, any>
) => {
    const { quote } = query;

    // Step 1: Check if orderId is a valid UUID
    const isUUID = uuidRegex.test(orderId);

    // Step 2: Build where condition based on input type
    const whereCondition = isUUID
        ? and(
              or(eq(orders.id, orderId), eq(orders.order_id, orderId)),
              eq(orders.platform_id, platformId)
          )
        : and(eq(orders.order_id, orderId), eq(orders.platform_id, platformId));

    // Step 3: Fetch order with relations
    const result = await db
        .select({
            order: orders,
            company: {
                id: companies.id,
                name: companies.name,
                platform_margin_percent: companies.platform_margin_percent,
            },
            brand: {
                id: brands.id,
                name: brands.name,
            },
            user: {
                id: users.id,
                name: users.name,
                email: users.email,
            },
            venue_city: {
                name: cities.name,
            },
            order_pricing: {
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(brands, eq(orders.brand_id, brands.id))
        .leftJoin(users, eq(orders.created_by, users.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .leftJoin(cities, eq(orders.venue_city_id, cities.id))
        .where(whereCondition)
        .limit(1);

    if (result.length === 0) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    const orderData = result[0];

    // Check access based on user role
    if (user.role === "CLIENT") {
        if (user.company_id !== orderData.order.company_id) {
            throw new CustomizedError(httpStatus.FORBIDDEN, "You don't have access to this order");
        }
    }

    if (
        quote === "true" &&
        orderData.order.order_status !== "QUOTED" &&
        orderData.order.order_status !== "CONFIRMED" &&
        orderData.order.order_status !== "DECLINED"
    ) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Order does not have a quote yet");
    }

    // Step 2: Fetch order items with asset details
    const itemResults = await db
        .select({
            order_item: {
                id: orderItems.id,
                asset_id: orderItems.asset_id,
                asset_name: orderItems.asset_name,
                quantity: orderItems.quantity,
                volume_per_unit: orderItems.volume_per_unit,
                weight_per_unit: orderItems.weight_per_unit,
                total_volume: orderItems.total_volume,
                total_weight: orderItems.total_weight,
                condition_notes: orderItems.condition_notes,
                handling_tags: orderItems.handling_tags,
                from_collection: orderItems.from_collection,
                from_collection_name: orderItems.from_collection_name,
                maintenance_decision: orderItems.maintenance_decision,
                requires_maintenance: orderItems.requires_maintenance,
                maintenance_refurb_days_snapshot: orderItems.maintenance_refurb_days_snapshot,
                maintenance_decision_locked_at: orderItems.maintenance_decision_locked_at,
            },
            asset: {
                id: assets.id,
                name: assets.name,
                qr_code: assets.qr_code,
                status: assets.status,
                condition: assets.condition,
                condition_notes: assets.condition_notes,
                refurbishment_days_estimate: assets.refurb_days_estimate,
                images: assets.images,
                on_display_image: assets.on_display_image,
            },
            collection: {
                id: collections.id,
                name: collections.name,
            },
        })
        .from(orderItems)
        .leftJoin(assets, eq(orderItems.asset_id, assets.id))
        .leftJoin(collections, eq(orderItems.from_collection, collections.id))
        .where(eq(orderItems.order_id, orderData.order.id));

    const [lineItems, linkedServiceRequests] = await Promise.all([
        LineItemsServices.getLineItems(platformId, { order_id: orderData.order.id }),
        getLinkedServiceRequestSummaries(orderData.order.id, platformId, user.role),
    ]);

    const financialHistory = await db
        .select()
        .from(financialStatusHistory)
        .where(eq(financialStatusHistory.order_id, orderData.order.id))
        .orderBy(desc(financialStatusHistory.timestamp));

    const orderHistory = await db
        .select()
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.order_id, orderData.order.id))
        .orderBy(desc(orderStatusHistory.timestamp));

    const invoice = await db
        .select()
        .from(invoices)
        .where(
            and(eq(invoices.order_id, orderData.order.id), eq(invoices.platform_id, platformId))
        );

    const invoiceData =
        invoice.length > 0
            ? invoice.map((i) => ({
                  id: i.id,
                  invoice_id: i.invoice_id,
                  invoice_pdf_url: i.invoice_pdf_url,
                  invoice_paid_at: i.invoice_paid_at,
                  payment_method: i.payment_method,
                  payment_reference: i.payment_reference,
                  created_at: i.created_at,
                  updated_at: i.updated_at,
              }))[0]
            : null;

    // Filter for CLIENT role: strip financial history and internal status details
    if (user.role === "CLIENT") {
        const CLIENT_SAFE_LABELS: Record<string, string> = {
            DRAFT: "Order Created",
            PRICING_REVIEW: "Order Received",
            PENDING_APPROVAL: "Order Under Review",
            QUOTED: "Quote Ready",
            DECLINED: "Quote Declined",
            CONFIRMED: "Order Confirmed",
            IN_PREPARATION: "Preparing Items",
            READY_FOR_DELIVERY: "Ready for Delivery",
            IN_TRANSIT: "In Transit",
            DELIVERED: "Delivered",
            IN_USE: "In Use",
            DERIG: "Derigging",
            AWAITING_RETURN: "Awaiting Pickup",
            RETURN_IN_TRANSIT: "Return In Transit",
            CLOSED: "Complete",
            CANCELLED: "Cancelled",
        };

        return {
            ...orderData.order,
            company: {
                ...orderData.company,
                platform_margin_percent: undefined,
            },
            brand: orderData.brand,
            user: orderData.user,
            items: itemResults,
            line_items: lineItems,
            linked_service_requests: linkedServiceRequests,
            order_status_history: orderHistory.map((h) => ({
                ...h,
                status_label: CLIENT_SAFE_LABELS[h.status] || h.status,
                notes: null,
            })),
            venue_city: orderData.venue_city?.name || null,
            order_pricing: PricingService.projectForRole(
                orderData.order_pricing,
                lineItems,
                "CLIENT"
            ),
            invoice: invoiceData,
        };
    }

    return {
        ...orderData.order,
        company: orderData.company,
        brand: orderData.brand,
        user: orderData.user,
        items: itemResults,
        line_items: lineItems,
        linked_service_requests: linkedServiceRequests,
        financial_status_history: financialHistory,
        order_status_history: orderHistory,
        venue_city: orderData.venue_city?.name || null,
        order_pricing: PricingService.projectForRole(orderData.order_pricing, lineItems, user.role),
        invoice: invoiceData,
    };
};

// ----------------------------------- UPDATE JOB NUMBER --------------------------------------
const updateJobNumber = async (orderId: string, jobNumber: string | null, platformId: string) => {
    // Step 1: Verify order exists
    const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)));

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 4: Update job number
    const [updatedOrder] = await db
        .update(orders)
        .set({
            job_number: jobNumber,
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

    return {
        id: updatedOrder.id,
        order_id: updatedOrder.order_id,
        job_number: updatedOrder.job_number,
        updated_at: updatedOrder.updated_at,
    };
};

// ----------------------------------- GET ORDER SCAN EVENTS ----------------------------------
const getOrderScanEvents = async (orderId: string, platformId: string, user: AuthUser) => {
    // Step 1: Verify order exists and user has access
    const [order] = await db
        .select({
            id: orders.id,
            order_id: orders.order_id,
            company_id: orders.company_id,
        })
        .from(orders)
        .where(and(eq(orders.order_id, orderId), eq(orders.platform_id, platformId)));

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    if (user.role === "CLIENT" && user.company_id !== order.company_id) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "You don't have access to this order");
    }

    // Step 2: Fetch canonical scan events with linked media/assets.
    const events = await db.query.scanEvents.findMany({
        where: eq(scanEvents.order_id, order.id),
        with: {
            asset: {
                columns: {
                    id: true,
                    name: true,
                    qr_code: true,
                    tracking_method: true,
                },
            },
            scanned_by_user: {
                columns: {
                    id: true,
                    name: true,
                },
            },
            event_assets: {
                columns: {
                    asset_id: true,
                    quantity: true,
                },
                with: {
                    asset: {
                        columns: {
                            id: true,
                            name: true,
                            qr_code: true,
                            tracking_method: true,
                        },
                    },
                },
            },
            event_media: {
                columns: {
                    id: true,
                    url: true,
                    note: true,
                    media_kind: true,
                    sort_order: true,
                    created_at: true,
                },
            },
        },
        orderBy: desc(scanEvents.scanned_at),
    });

    return events.map((event) => {
        const orderedMedia = [...(event.event_media || [])].sort(
            (a, b) => (a.sort_order || 0) - (b.sort_order || 0)
        );
        const damageMedia = orderedMedia.filter((item) => item.media_kind === "DAMAGE");
        const returnMedia = orderedMedia.filter((item) => item.media_kind === "RETURN_WIDE");
        const generalMedia = orderedMedia.filter(
            (item) => !["DAMAGE", "RETURN_WIDE"].includes(item.media_kind)
        );

        const primaryAsset = event.asset || event.event_assets[0]?.asset || null;

        return {
            ...event,
            media: orderedMedia.map((item) => ({
                id: item.id,
                url: item.url,
                note: item.note,
                media_kind: item.media_kind,
                sort_order: item.sort_order,
                created_at: item.created_at,
            })),
            assets: event.event_assets.map((item) => ({
                asset_id: item.asset_id,
                quantity: item.quantity,
                asset: item.asset,
            })),
            // Backward-safe projections consumed by existing UIs.
            photos: [...new Set([...generalMedia, ...damageMedia].map((item) => item.url))],
            latest_return_images: returnMedia.map((item) => item.url),
            damage_report_photos: damageMedia.map((item) => item.url),
            damage_report_entries: damageMedia.map((item) => ({
                url: item.url,
                description: item.note || undefined,
            })),
            asset: primaryAsset,
            scanned_by_user: event.scanned_by_user,
            order: {
                id: order.id,
                order_id: order.order_id,
            },
        };
    });
};

// ----------------------------------- PROGRESS ORDER STATUS ----------------------------------
const progressOrderStatus = async (
    orderId: string,
    payload: ProgressStatusPayload,
    user: AuthUser,
    platformId: string
) => {
    const { new_status, notes, delivery_photos } = payload;

    if (new_status === "CONFIRMED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Only client can confirm order by approve quote"
        );
    }

    // Step 1: Get order with company details and items
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: {
                columns: {
                    id: true,
                    name: true,
                },
            },
            items: {
                with: {
                    asset: {
                        columns: {
                            id: true,
                            refurb_days_estimate: true,
                        },
                    },
                },
            },
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Check company access for CLIENT users
    if (user.role === "CLIENT") {
        if (user.company_id !== order.company_id) {
            throw new CustomizedError(httpStatus.FORBIDDEN, "You do not have access to this order");
        }
    }

    // Step 3: Validate state transition
    const currentStatus = order.order_status;

    if (!isValidTransition(currentStatus, new_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Invalid state transition from ${currentStatus} to ${new_status}`
        );
    }

    // Step 4: Check role-based transition permissions
    const hasPermission = validateRoleBasedTransition(user, currentStatus, new_status);
    if (!hasPermission) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            `You do not have permission to transition from ${currentStatus} to ${new_status}`
        );
    }

    const unresolvedMaintenanceItems =
        currentStatus === "CONFIRMED" && new_status === "IN_PREPARATION"
            ? await getUnresolvedMaintenanceReadinessItems(order.id, platformId)
            : [];

    if (FULFILLMENT_READINESS_STATUSES.has(new_status)) {
        const hasBlockingSR = await hasUnresolvedBlockingServiceRequests(order.id, platformId);
        if (hasBlockingSR) {
            if (unresolvedMaintenanceItems.length > 0) {
                const assetNames = unresolvedMaintenanceItems
                    .map((item) => item.asset_name)
                    .filter(Boolean)
                    .join(", ");

                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    assetNames
                        ? `Cannot progress order to IN_PREPARATION while maintenance-required items remain unresolved: ${assetNames}`
                        : "Cannot progress order to IN_PREPARATION while maintenance-required items remain unresolved"
                );
            }
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Cannot progress order while blocking linked service requests are unresolved"
            );
        }
    }

    // Step 4.5: Validate date-based transitions
    const today = dayjs().startOf("day");

    if (currentStatus === "CONFIRMED" && new_status === "IN_PREPARATION") {
        if (unresolvedMaintenanceItems.length > 0) {
            const assetNames = unresolvedMaintenanceItems
                .map((item) => item.asset_name)
                .filter(Boolean)
                .join(", ");

            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                assetNames
                    ? `Cannot progress order to IN_PREPARATION while maintenance-required items remain unresolved: ${assetNames}`
                    : "Cannot progress order to IN_PREPARATION while maintenance-required items remain unresolved"
            );
        }
    }

    // Check if transitioning from DELIVERED to IN_USE
    if (currentStatus === "DELIVERED" && new_status === "IN_USE") {
        const eventStartDate = dayjs(order.event_start_date).startOf("day");

        if (today.isBefore(eventStartDate)) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Cannot mark order as IN_USE before event start date (${eventStartDate.format("YYYY-MM-DD")}). Current date: ${today.format("YYYY-MM-DD")}`
            );
        }
    }

    // Check if transitioning from IN_USE to AWAITING_RETURN
    if (currentStatus === "IN_USE" && new_status === "AWAITING_RETURN") {
        const eventEndDate = dayjs(order.event_end_date).startOf("day");

        if (today.isBefore(eventEndDate)) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Cannot mark order as AWAITING_RETURN before event end date (${eventEndDate.format("YYYY-MM-DD")}). Current date: ${today.format("YYYY-MM-DD")}`
            );
        }
    }

    if (new_status === "CLOSED") {
        // Validate that all items have been scanned in (inbound)
        const allItemsScanned = await validateInboundScanningComplete(orderId);

        if (!allItemsScanned) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Cannot close order: Inbound scanning is not complete. All items must be scanned in before closing the order."
            );
        }

        // Release bookings and restore availability.
        await releaseOrderBookingsAndRestoreAvailability(db, orderId, platformId);
    }

    // Step 5: Update order status
    const updatePayload: {
        order_status: typeof orders.$inferSelect.order_status;
        updated_at: Date;
        delivery_photos?: string[];
    } = {
        order_status: new_status as any,
        updated_at: new Date(),
    };
    if (new_status === "DELIVERED" && delivery_photos?.length) {
        const normalizedPhotos = delivery_photos.filter(Boolean);
        if (normalizedPhotos.length > 0) {
            const existingDeliveryPhotos = Array.isArray(order.delivery_photos)
                ? order.delivery_photos
                : [];
            updatePayload.delivery_photos = Array.from(
                new Set([...existingDeliveryPhotos, ...normalizedPhotos])
            );
        }
    }
    await db.update(orders).set(updatePayload).where(eq(orders.id, orderId));

    // Step 6: Create status history entry
    await db.insert(orderStatusHistory).values({
        platform_id: platformId,
        order_id: orderId,
        status: new_status as any,
        notes: notes || null,
        updated_by: user.id,
    });

    // Step 7: Get updated order
    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));

    // Step 8: Emit event for status transitions that have notifications
    const statusTransitionEventMap: Record<string, string> = {
        "CONFIRMED->IN_PREPARATION": EVENT_TYPES.ORDER_CONFIRMED,
        "READY_FOR_DELIVERY->IN_TRANSIT": EVENT_TYPES.ORDER_IN_TRANSIT,
        "IN_TRANSIT->DELIVERED": EVENT_TYPES.ORDER_DELIVERED,
    };
    const transitionEventType = statusTransitionEventMap[`${currentStatus}->${new_status}`];
    if (transitionEventType) {
        const [orderWithCompany] = await db
            .select({ company_name: companies.name, company_id: companies.id })
            .from(companies)
            .where(eq(companies.id, updatedOrder.company_id!));

        await eventBus.emit({
            platform_id: platformId,
            event_type: transitionEventType,
            entity_type: "ORDER",
            entity_id: updatedOrder.id,
            actor_id: user.id,
            actor_role: user.role,
            payload: {
                entity_id_readable: updatedOrder.order_id,
                company_id: updatedOrder.company_id,
                company_name: orderWithCompany?.company_name || "N/A",
                contact_name: updatedOrder.contact_name,
                event_start_date: updatedOrder.event_start_date?.toISOString().split("T")[0] || "",
                venue_name: updatedOrder.venue_name,
                venue_city: "",
                delivery_window: updatedOrder.delivery_window || "",
                pickup_window: updatedOrder.pickup_window || "",
                order_url: "",
            },
        });
    }

    return {
        id: updatedOrder.id,
        order_id: updatedOrder.order_id,
        order_status: updatedOrder.order_status,
        financial_status: updatedOrder.financial_status,
        updated_at: updatedOrder.updated_at,
    };
};

// ----------------------------------- GET ORDER STATUS HISTORY -------------------------------
const getOrderStatusHistory = async (orderId: string, user: AuthUser, platformId: string) => {
    // Step 1: Verify order exists and user has access
    const [order] = await db
        .select({
            id: orders.id,
            order_id: orders.order_id,
            order_status: orders.order_status,
            company_id: orders.company_id,
        })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)));

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Check company access (clients can only see own company)
    if (user.role === "CLIENT") {
        if (user.company_id !== order.company_id) {
            throw new CustomizedError(httpStatus.FORBIDDEN, "You do not have access to this order");
        }
    }

    // Step 3: Fetch status history
    const history = await db
        .select({
            id: orderStatusHistory.id,
            status: orderStatusHistory.status,
            notes: orderStatusHistory.notes,
            timestamp: orderStatusHistory.timestamp,
            updated_by_user: {
                id: users.id,
                name: users.name,
                email: users.email,
            },
        })
        .from(orderStatusHistory)
        .leftJoin(users, eq(orderStatusHistory.updated_by, users.id))
        .where(eq(orderStatusHistory.order_id, order.id))
        .orderBy(desc(orderStatusHistory.timestamp));

    // Step 4: Filter for CLIENT role — strip internal details
    if (user.role === "CLIENT") {
        const CLIENT_SAFE_LABELS: Record<string, string> = {
            DRAFT: "Order Created",
            PRICING_REVIEW: "Order Received",
            PENDING_APPROVAL: "Order Under Review",
            QUOTED: "Quote Ready",
            DECLINED: "Quote Declined",
            CONFIRMED: "Order Confirmed",
            IN_PREPARATION: "Preparing Items",
            READY_FOR_DELIVERY: "Ready for Delivery",
            IN_TRANSIT: "In Transit",
            DELIVERED: "Delivered",
            IN_USE: "In Use",
            DERIG: "Derigging",
            AWAITING_RETURN: "Awaiting Pickup",
            RETURN_IN_TRANSIT: "Return In Transit",
            CLOSED: "Complete",
            CANCELLED: "Cancelled",
        };

        const filtered = history.map((entry) => ({
            id: entry.id,
            status: entry.status,
            status_label: CLIENT_SAFE_LABELS[entry.status] || entry.status,
            notes: null, // Strip internal notes
            timestamp: entry.timestamp,
            updated_by_user: { id: null, name: "System", email: null },
        }));

        return {
            order_id: order.order_id,
            current_status: order.order_status,
            history: filtered,
        };
    }

    return {
        order_id: order.order_id,
        current_status: order.order_status,
        history: history,
    };
};

// ----------------------------------- UPDATE ORDER TIME WINDOWS ------------------------------
const updateOrderTimeWindows = async (
    orderId: string,
    payload: UpdateOrderTimeWindowsPayload,
    platformId: string,
    user?: AuthUser
) => {
    // Step 1: Verify order exists
    const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)));

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Validate order status (immutable statuses)
    const immutableStatuses = [
        "IN_TRANSIT",
        "DELIVERED",
        "IN_USE",
        "AWAITING_RETURN",
        "RETURN_IN_TRANSIT",
        "CLOSED",
    ];
    if (immutableStatuses.includes(order.order_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Cannot update time windows after order is in transit"
        );
    }

    // Step 3: Update order
    const deliveryStart = new Date(payload.delivery_window_start);
    const deliveryEnd = new Date(payload.delivery_window_end);
    const pickupStart = new Date(payload.pickup_window_start);
    const pickupEnd = new Date(payload.pickup_window_end);

    const [updatedOrder] = await db
        .update(orders)
        .set({
            delivery_window: { start: deliveryStart, end: deliveryEnd },
            pickup_window: { start: pickupStart, end: pickupEnd },
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

    // Step 4: Log history entry for audit trail
    if (user) {
        await db.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: order.order_status,
            notes: `Time windows updated: Delivery ${deliveryStart.toISOString().split("T")[0]} - ${deliveryEnd.toISOString().split("T")[0]}, Pickup ${pickupStart.toISOString().split("T")[0]} - ${pickupEnd.toISOString().split("T")[0]}`,
            updated_by: user.id,
        });
    }

    // Step 5: Emit time windows updated event
    const [twCompany] = await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, updatedOrder.company_id!));

    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.ORDER_TIME_WINDOWS_UPDATED,
        entity_type: "ORDER",
        entity_id: updatedOrder.id,
        actor_id: user?.id ?? null,
        actor_role: user?.role ?? null,
        payload: {
            entity_id_readable: updatedOrder.order_id,
            company_id: updatedOrder.company_id,
            company_name: twCompany?.name || "N/A",
            contact_name: updatedOrder.contact_name,
            delivery_window: updatedOrder.delivery_window || "",
            pickup_window: updatedOrder.pickup_window || "",
            order_url: "",
        },
    });

    return {
        id: updatedOrder.id,
        order_id: updatedOrder.order_id,
        delivery_window: updatedOrder.delivery_window,
        pickup_window: updatedOrder.pickup_window,
        updated_at: updatedOrder.updated_at,
    };
};

// ----------------------------------- APPROVE QUOTE ------------------------------------------
const approveQuote = async (
    orderId: string,
    user: AuthUser,
    platformId: string,
    payload: ApproveQuotePayload
) => {
    const { notes, po_number } = payload;
    const normalizedPoNumber = po_number?.trim() || null;
    // Step 1: Fetch order with company and pricing details
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: true,
            order_pricing: true,
            items: {
                with: {
                    asset: {
                        columns: {
                            id: true,
                            name: true,
                            refurb_days_estimate: true,
                            tracking_method: true,
                        },
                    },
                },
            },
        },
    });

    if (!order || user.company_id !== order.company_id) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Order not found or you do not have access to this order"
        );
    }

    // Step 2: Verify order is in QUOTED status
    if (order.order_status !== "QUOTED") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Order is not in QUOTED status");
    }

    // Step 3: Verify order has event dates
    if (!order.event_start_date || !order.event_end_date) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Order must have event dates");
    }

    const poRequired = await isClientPoRequiredForQuoteApproval(platformId, order.company.features);
    if (poRequired && !normalizedPoNumber) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "PO number is required before accepting the quote"
        );
    }

    // Step 4: Check assets availability
    const requiredAssets = order.items.map((item) => ({
        id: item.asset_id,
        quantity: item.quantity,
    }));

    const foundAssets = await checkAssetsForOrder(
        platformId,
        order.company_id,
        requiredAssets,
        order.event_start_date,
        order.event_end_date
    );

    // Step 5: Prepare asset bookings data
    const assetBookingItems = foundAssets.map((item) => {
        const totalPrepDays = PREP_BUFFER_DAYS + (item.refurb_days_estimate || 0);
        const blockedFrom = dayjs(order.event_start_date).subtract(totalPrepDays, "day").toDate();
        const blockedUntil = dayjs(order.event_end_date).add(RETURN_BUFFER_DAYS, "day").toDate();

        const requiredAsset = requiredAssets.find((a) => a.id === item.id);

        return {
            asset_id: item.id,
            order_id: orderId,
            quantity: requiredAsset?.quantity || 0,
            blocked_from: blockedFrom,
            blocked_until: blockedUntil,
        };
    });

    // Step 6: Insert asset bookings data, update order and asset status and create order history
    await db.transaction(async (tx) => {
        await tx.insert(assetBookings).values(assetBookingItems);

        for (const asset of foundAssets) {
            await tx
                .update(assets)
                .set({ status: asset.status, available_quantity: asset.available_quantity })
                .where(eq(assets.id, asset.id));
        }
    });
    const nextStatus = "CONFIRMED";
    const orderUpdateData: Record<string, unknown> = {
        order_status: nextStatus,
        financial_status: "QUOTE_ACCEPTED",
        updated_at: new Date(),
    };

    if (normalizedPoNumber) {
        orderUpdateData.po_number = normalizedPoNumber;
    }

    await db.transaction(async (tx) => {
        // Update order status based on reskins
        await tx
            .update(orders)
            .set(orderUpdateData)
            .where(eq(orders.id, orderId));

        // Log status change
        await tx.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: nextStatus,
            notes: notes || "Client approved quote",
            updated_by: user.id,
        });
    });

    await autoApproveBundledServiceRequests(orderId, platformId, user);
    const approvedOrderTotal =
        PricingService.projectSummaryForRole((order.order_pricing as any) || null, "CLIENT")
            ?.final_total || "0";

    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.QUOTE_APPROVED,
        entity_type: "ORDER",
        entity_id: order.id,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            entity_id_readable: order.order_id,
            company_id: order.company_id,
            company_name: (order.company as any)?.name || "N/A",
            contact_name: order.contact_name,
            final_total: String(approvedOrderTotal),
            order_url: "",
        },
    });

    return {
        id: order.id,
        order_id: order.order_id,
        order_status: nextStatus,
        financial_status: "QUOTE_ACCEPTED",
        po_number: normalizedPoNumber ?? order.po_number ?? null,
        updated_at: new Date(),
    };
};

// ----------------------------------- DECLINE QUOTE ------------------------------------------
const declineQuote = async (
    orderId: string,
    user: AuthUser,
    platformId: string,
    payload: DeclineQuotePayload
) => {
    const { decline_reason } = payload;

    // Step 1: Fetch order with company details
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: true,
        },
    });

    if (!order || user.company_id !== order.company_id) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Order not found or you do not have access to this order"
        );
    }

    // Step 2: Verify order is in QUOTED status
    if (order.order_status !== "QUOTED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order is not in QUOTED status. Current status: ${order.order_status}`
        );
    }

    await db.transaction(async (tx) => {
        // Step 4: Update order status to DECLINED and financial status to CANCELLED
        await tx
            .update(orders)
            .set({
                order_status: "DECLINED",
                financial_status: "CANCELLED",
                updated_at: new Date(),
            })
            .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)));

        // Step 5: Log status change in order_status_history
        await tx.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "DECLINED",
            notes: `Client declined quote: ${decline_reason}`,
            updated_by: user.id,
        });

        // Step 5b: Log financial status change
        await tx.insert(financialStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "CANCELLED",
            notes: `Quote declined by client: ${decline_reason}`,
            updated_by: user.id,
        });
    });

    // Step 6: Emit quote.declined event
    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.QUOTE_DECLINED,
        entity_type: "ORDER",
        entity_id: order.id,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            entity_id_readable: order.order_id,
            company_id: order.company_id,
            company_name: order.company?.name || "N/A",
            contact_name: order.contact_name,
            order_url: "",
        },
    });

    // Step 7: Return updated order details
    return {
        id: order.id,
        order_id: order.order_id,
        order_status: "DECLINED",
        updated_at: new Date(),
    };
};

// ----------------------------------- GET CLIENT ORDER STATISTICS ----------------------------
const getClientOrderStatistics = async (companyId: string, platformId: string) => {
    // Get today's date for upcoming events filter
    const today = new Date().toISOString().split("T")[0];

    // Base condition for all queries
    const baseCondition = and(
        eq(orders.company_id, companyId),
        eq(orders.platform_id, platformId),
        isNull(orders.deleted_at)
    );

    // Fetch all orders in a single query
    const allOrders = await db
        .select({
            id: orders.id,
            order_id: orders.order_id,
            venue_name: orders.venue_name,
            event_start_date: orders.event_start_date,
            event_end_date: orders.event_end_date,
            order_status: orders.order_status,
            created_at: orders.created_at,
        })
        .from(orders)
        .where(baseCondition)
        .orderBy(desc(orders.created_at));

    // Define status categories
    const activeOrderStatuses = [
        "CONFIRMED",
        "IN_PREPARATION",
        "READY_FOR_DELIVERY",
        "IN_TRANSIT",
        "DELIVERED",
        "IN_USE",
        "DERIG",
        "AWAITING_RETURN",
        "RETURN_IN_TRANSIT",
    ];
    const upcomingEventStatuses = ["CONFIRMED", "IN_PREPARATION"];

    // Process counts in memory
    let activeOrdersCount = 0;
    let pendingQuotesCount = 0;
    let upcomingEventsCount = 0;
    let awaitingReturnCount = 0;

    for (const order of allOrders) {
        // Count active orders
        if (activeOrderStatuses.includes(order.order_status)) {
            activeOrdersCount++;
        }

        // Count pending quotes
        if (order.order_status === "QUOTED") {
            pendingQuotesCount++;
        }

        // Count upcoming events
        if (
            upcomingEventStatuses.includes(order.order_status) &&
            order.event_start_date &&
            order.event_start_date >= new Date(today)
        ) {
            upcomingEventsCount++;
        }

        // Count awaiting return
        if (order.order_status === "AWAITING_RETURN") {
            awaitingReturnCount++;
        }
    }

    // Get 5 most recent orders
    const recentOrders = allOrders.slice(0, 5);

    return {
        summary: {
            active_orders: activeOrdersCount,
            pending_quotes: pendingQuotesCount,
            upcoming_events: upcomingEventsCount,
            awaiting_return: awaitingReturnCount,
        },
        recent_orders: recentOrders.map((order) => ({
            id: order.id,
            order_id: order.order_id,
            venue_name: order.venue_name,
            event_start_date: order.event_start_date,
            event_end_date: order.event_end_date,
            order_status: order.order_status,
            created_at: order.created_at,
        })),
    };
};

// ----------------------------------- SEND INVOICE -------------------------------------------
const sendInvoice = async (user: AuthUser, platformId: string, orderId: string) => {
    void user;
    void platformId;
    void orderId;
    throw new CustomizedError(
        httpStatus.NOT_IMPLEMENTED,
        "Invoicing is disabled in this pre-alpha branch. Endpoint is reserved as a stub."
    );
};

// ----------------------------------- SUBMIT FOR APPROVAL ------------------------------------
const submitForApproval = async (orderId: string, user: AuthUser, platformId: string) => {
    // Step 1: Fetch order with details
    const [result] = await db
        .select({
            order: orders,
            company: {
                id: companies.id,
                name: companies.name,
                platform_margin_percent: companies.platform_margin_percent,
                warehouse_ops_rate: companies.warehouse_ops_rate,
            },
            order_pricing: {
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)))
        .limit(1);

    const order = result.order;
    const company = result.company;
    const orderPricing = result.order_pricing;

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }
    if (!company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found for this order");
    }
    if (!orderPricing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order pricing not found for this order");
    }
    // Step 2: Verify order is in PRICING_REVIEW status
    if (order.order_status !== "PRICING_REVIEW") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order is not in PRICING_REVIEW status. Current status: ${order.order_status}`
        );
    }

    // Step 3: Recalculate pricing
    await PricingService.recalculate({
        entity_type: "ORDER",
        entity_id: orderId,
        platform_id: platformId,
        calculated_by: user.id,
    });

    // Step 4: Update order status
    await db.transaction(async (tx) => {
        await tx
            .update(orders)
            .set({
                order_status: "PENDING_APPROVAL",
                updated_at: new Date(),
            })
            .where(eq(orders.id, orderId));

        await db.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "PENDING_APPROVAL",
            notes: "Logistics submitted for Admin approval",
            updated_by: user.id,
        });
    });

    // Step 6: Return updated order
    return {
        id: order.id,
        order_id: order.order_id,
        order_status: "PENDING_APPROVAL",
        updated_at: new Date(),
    };
};

// ----------------------------------- ADMIN APPROVE QUOTE ------------------------------------
const adminApproveQuote = async (
    orderId: string,
    user: AuthUser,
    platformId: string,
    payload: AdminApproveQuotePayload
) => {
    const { margin_override_percent, margin_override_reason } = payload;

    // Step 1: Fetch order with details
    const [result] = await db
        .select({
            order: orders,
            company: {
                id: companies.id,
                name: companies.name,
                platform_margin_percent: companies.platform_margin_percent,
                warehouse_ops_rate: companies.warehouse_ops_rate,
            },
            order_pricing: {
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)))
        .limit(1);

    const order = result.order;
    const company = result.company;
    const orderPricing = result.order_pricing;

    // Step 2: Validate order status violations and checks
    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }
    if (!company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found for this order");
    }
    if (!orderPricing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order pricing not found for this order");
    }
    if (order.order_status !== "PENDING_APPROVAL") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order is not in PENDING_APPROVAL status. Current status: ${order.order_status}`
        );
    }

    // Determine if this is a revised quote (order was previously quoted)
    const isRevisedQuote = ["QUOTE_SENT", "QUOTE_REVISED"].includes(order.financial_status);
    const newFinancialStatus = isRevisedQuote ? "QUOTE_REVISED" : "QUOTE_SENT";

    const projectedAdminPricing = PricingService.projectByRole(orderPricing as any, "ADMIN") as any;
    let finalTotal = String(projectedAdminPricing?.final_total || "0");
    let baseOpsTotalForEvent = String(projectedAdminPricing?.base_ops_total || "0");
    let marginAmountForEvent = String(projectedAdminPricing?.margin?.amount || "0");

    // Step 3: Update order pricing and status
    await db.transaction(async (tx) => {
        if (margin_override_percent) {
            const result = await PricingService.recalculate({
                entity_type: "ORDER",
                entity_id: orderId,
                platform_id: platformId,
                calculated_by: user.id,
                set_margin_override: {
                    percent: margin_override_percent,
                    reason: margin_override_reason || null,
                },
                tx,
            });
            finalTotal = result.final_total.toFixed(2);
            baseOpsTotalForEvent = result.base_ops_total.toFixed(2);
            marginAmountForEvent = result.margin.amount.toFixed(2);
        }

        // Step 3.2: Update order status
        await tx
            .update(orders)
            .set({
                order_status: "QUOTED",
                financial_status: newFinancialStatus,
                updated_at: new Date(),
            })
            .where(eq(orders.id, orderId));

        // Step 3.3: Log status history
        await tx.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "QUOTED",
            notes: margin_override_percent
                ? `Admin approved with margin override (${margin_override_percent}%): ${margin_override_reason}`
                : isRevisedQuote
                  ? "Admin approved revised quote"
                  : "Admin approved quote",
            updated_by: user.id,
        });

        // Step 3.4: Log financial status history
        await tx.insert(financialStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: newFinancialStatus,
            notes: isRevisedQuote ? "Revised quote sent to client" : "Quote sent to client",
            updated_by: user.id,
        });
    });

    // Generate/update cost estimate PDF after approval.
    await DocumentService.generateEstimate("ORDER", orderId, platformId, {
        regenerate: true,
        generatedByUserId: user.id,
    });

    // Step 4: Emit quote.sent event
    await eventBus.emit({
        platform_id: platformId,
        event_type: isRevisedQuote ? EVENT_TYPES.QUOTE_REVISED : EVENT_TYPES.QUOTE_SENT,
        entity_type: "ORDER",
        entity_id: order.id,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            entity_id_readable: order.order_id,
            company_id: order.company_id,
            company_name: company?.name || "N/A",
            contact_name: order.contact_name,
            contact_email: order.contact_email,
            final_total: finalTotal,
            line_items: [],
            pricing: {
                base_ops_total: baseOpsTotalForEvent,
                logistics_sub_total: baseOpsTotalForEvent,
                margin_amount: marginAmountForEvent,
                final_total: finalTotal,
            },
            cost_estimate_url: `${config.server_url}/client/v1/invoice/download-cost-estimate-pdf/${order.order_id}?pid=${platformId}`,
            order_url: "",
        },
    });

    // Step 5: Return updated order
    return {
        id: order.id,
        order_id: order.order_id,
        order_status: "QUOTED",
        financial_status: newFinancialStatus,
        final_total: finalTotal,
        updated_at: new Date(),
    };
};

// ----------------------------------- RETURN TO LOGISTICS ------------------------------------
// Admin returns order to Logistics for revisions
const returnToLogistics = async (
    orderId: string,
    user: AuthUser,
    platformId: string,
    reason: string
) => {
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    if (order.order_status !== "PENDING_APPROVAL") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order is not in PENDING_APPROVAL status. Current status: ${order.order_status}`
        );
    }

    // Update order status
    await db
        .update(orders)
        .set({
            order_status: "PRICING_REVIEW",
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));

    // Log status change
    await db.insert(orderStatusHistory).values({
        platform_id: platformId,
        order_id: orderId,
        status: "PRICING_REVIEW",
        notes: `Admin returned to Logistics: ${reason}`,
        updated_by: user.id,
    });

    // TODO: Send notification to Logistics

    return {
        id: order.id,
        order_id: order.order_id,
        order_status: "PRICING_REVIEW",
        updated_at: new Date(),
    };
};

// ----------------------------------- CANCEL ORDER (NEW) ------------------------------------
export async function cancelOrder(
    orderId: string,
    platformId: string,
    payload: CancelOrderPayload,
    user: AuthUser
) {
    const { reason, notes, notify_client } = payload;

    // Get order
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Validate order can be cancelled
    if (NON_CANCELLABLE_STATUSES.includes(order.order_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot cancel order in ${order.order_status} status. Items have already left the warehouse or order is already terminal.`
        );
    }

    await db.transaction(async (tx) => {
        // 1. Update order status
        await tx
            .update(orders)
            .set({
                order_status: "CANCELLED",
                financial_status: "CANCELLED",
                updated_at: new Date(),
            })
            .where(eq(orders.id, orderId));

        // 2. Release all bookings and restore availability
        await releaseOrderBookingsAndRestoreAvailability(tx, orderId, platformId);

        // 2b. Cancel all non-terminal INTERNAL_ONLY SRs linked to this order
        await tx
            .update(serviceRequests)
            .set({
                request_status: "CANCELLED",
                cancelled_at: new Date(),
                cancelled_by: user.id,
                cancellation_reason: `Order cancelled: ${reason}`,
                updated_at: new Date(),
            })
            .where(
                and(
                    eq(serviceRequests.related_order_id, orderId),
                    eq(serviceRequests.billing_mode, "INTERNAL_ONLY"),
                    notInArray(serviceRequests.request_status, ["COMPLETED", "CANCELLED"])
                )
            );

        // 3. Log to order status history
        await tx.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "CANCELLED",
            notes: `${reason}: ${notes}`,
            updated_by: user.id,
        });

        // 4. Log to financial status history
        await tx.insert(financialStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "CANCELLED",
            notes: `${reason}: ${notes}`,
            updated_by: user.id,
        });
    });

    const orderForNotification = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: { company: true },
    });

    if (orderForNotification) {
        await eventBus.emit({
            platform_id: platformId,
            event_type: EVENT_TYPES.ORDER_CANCELLED,
            entity_type: "ORDER",
            entity_id: orderId,
            actor_id: user.id,
            actor_role: user.role,
            payload: {
                entity_id_readable: orderForNotification.order_id,
                company_id: orderForNotification.company_id,
                company_name: (orderForNotification.company as any)?.name || "N/A",
                contact_name: orderForNotification.contact_name,
                cancellation_reason: reason,
                cancellation_notes: notes,
                suppress_entity_owner: !notify_client,
                order_url: "",
            },
        });
    }

    return {
        success: true,
        order_id: order.order_id,
        cancelled_reskins: 0,
    };
}

// ----------------------------------- GET PENDING APPROVAL ORDERS ---------------------------
// Get orders waiting for Admin approval
const getPendingApprovalOrders = async (query: any, platformId: string) => {
    const { search_term, page, limit, sort_by, sort_order, company_id, date_from, date_to } = query;

    // Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } = paginationMaker({
        page,
        limit,
        sort_by,
        sort_order,
    });

    // Build WHERE conditions
    const conditions: any[] = [
        eq(orders.platform_id, platformId),
        eq(orders.order_status, "PENDING_APPROVAL"),
    ];

    if (search_term && search_term.trim().length > 0) {
        conditions.push(ilike(orders.order_id, `%${search_term.trim()}%`));
    }

    if (company_id) {
        conditions.push(eq(orders.company_id, company_id));
    }

    if (date_from) {
        const fromDate = new Date(date_from);
        if (!isNaN(fromDate.getTime())) {
            conditions.push(gte(orders.created_at, fromDate));
        }
    }

    if (date_to) {
        const toDate = new Date(date_to);
        if (!isNaN(toDate.getTime())) {
            conditions.push(lte(orders.created_at, toDate));
        }
    }

    // Determine sort order
    const orderByColumn = orderSortableFields[sortWith] || orders.created_at;
    const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    // Execute queries
    const [result, total] = await Promise.all([
        db.query.orders.findMany({
            where: and(...conditions),
            with: {
                company: { columns: { id: true, name: true } },
                items: { with: { asset: true } },
            },
            orderBy: orderDirection,
            limit: limitNumber,
            offset: skip,
        }),
        db
            .select({ count: count() })
            .from(orders)
            .where(and(...conditions)),
    ]);

    return {
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: total[0].count,
        },
        data: result,
    };
};

// ------------------------------- UPDATE MAINTENANCE DECISION -------------------------------
const updateMaintenanceDecision = async (
    orderId: string,
    platformId: string,
    payload: UpdateMaintenanceDecisionPayload
) => {
    const { order_item_id, maintenance_decision } = payload;

    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        columns: {
            id: true,
            order_status: true,
            financial_status: true,
        },
    });

    if (!order) throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    if (
        ["QUOTE_ACCEPTED", "PENDING_INVOICE", "INVOICED", "PAID"].includes(order.financial_status)
    ) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Maintenance decisions are locked after client quote approval"
        );
    }
    if (order.order_status === "CANCELLED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Maintenance decisions cannot be changed for cancelled orders"
        );
    }

    const [orderItemRecord] = await db
        .select({
            id: orderItems.id,
            asset_id: orderItems.asset_id,
            asset_name: orderItems.asset_name,
            condition: assets.condition,
            refurb_days_estimate: assets.refurb_days_estimate,
        })
        .from(orderItems)
        .innerJoin(assets, eq(orderItems.asset_id, assets.id))
        .where(
            and(
                eq(orderItems.id, order_item_id),
                eq(orderItems.order_id, orderId),
                eq(orderItems.platform_id, platformId)
            )
        )
        .limit(1);

    if (!orderItemRecord) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order item not found");
    }

    if (orderItemRecord.condition === "GREEN") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Maintenance decision can only be set for ORANGE or RED assets"
        );
    }
    if (orderItemRecord.condition === "RED" && maintenance_decision !== "FIX_IN_ORDER") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "RED assets must use FIX_IN_ORDER maintenance decision"
        );
    }

    const requiresMaintenance =
        orderItemRecord.condition === "RED" || maintenance_decision === "FIX_IN_ORDER";
    const maintenanceRefurbDaysSnapshot = requiresMaintenance
        ? Number(orderItemRecord.refurb_days_estimate || 0)
        : null;

    const [updatedItem] = await db
        .update(orderItems)
        .set({
            maintenance_decision:
                orderItemRecord.condition === "RED" ? "FIX_IN_ORDER" : maintenance_decision,
            requires_maintenance: requiresMaintenance,
            maintenance_refurb_days_snapshot: maintenanceRefurbDaysSnapshot,
            maintenance_decision_locked_at: new Date(),
        })
        .where(eq(orderItems.id, order_item_id))
        .returning({
            id: orderItems.id,
            asset_id: orderItems.asset_id,
            asset_name: orderItems.asset_name,
            maintenance_decision: orderItems.maintenance_decision,
            requires_maintenance: orderItems.requires_maintenance,
            maintenance_refurb_days_snapshot: orderItems.maintenance_refurb_days_snapshot,
            maintenance_decision_locked_at: orderItems.maintenance_decision_locked_at,
        });

    return updatedItem;
};

// ----------------------------------- DOWNLOAD GOODS FORM ------------------------------------
const downloadGoodsForm = async (
    orderId: string,
    platformId: string,
    user: AuthUser,
    formType: GoodsFormType | "AUTO" = "AUTO"
) => {
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: true,
            brand: true,
            venue_city: true,
            items: true,
            line_items: true,
        },
    });

    if (!order) throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");

    const resolvedFormType: GoodsFormType =
        formType === "AUTO"
            ? ["AWAITING_RETURN", "RETURN_IN_TRANSIT", "CLOSED"].includes(order.order_status)
                ? "GOODS_IN"
                : "GOODS_OUT"
            : formType;
    const deliveryWindow = order.delivery_window as {
        start?: Date | string | null;
        end?: Date | string | null;
    } | null;
    const pickupWindow = order.pickup_window as {
        start?: Date | string | null;
        end?: Date | string | null;
    } | null;
    const candidateLegType = resolvedFormType === "GOODS_IN" ? "PICKUP" : "DELIVERY";
    const transportTrips = await db
        .select({
            leg_type: orderTransportTrips.leg_type,
            truck_size: orderTransportTrips.truck_size,
            sequence_no: orderTransportTrips.sequence_no,
        })
        .from(orderTransportTrips)
        .where(
            and(
                eq(orderTransportTrips.order_id, order.id),
                eq(orderTransportTrips.platform_id, platformId)
            )
        )
        .orderBy(asc(orderTransportTrips.sequence_no), asc(orderTransportTrips.created_at));

    const selectedTrip =
        transportTrips.find((trip) => trip.leg_type === candidateLegType) || transportTrips[0];
    const tripType = selectedTrip?.leg_type || "";
    const vehicleType = selectedTrip?.truck_size || "";

    const buffer = await generateGoodsFormXlsx({
        form_type: resolvedFormType,
        order_id: order.order_id,
        company_name: order.company?.name || "",
        brand_name: order.brand?.name || "",
        venue_name: order.venue_name || "",
        venue_city: order.venue_city?.name || "",
        event_start_date: order.event_start_date,
        event_end_date: order.event_end_date,
        trip_type: tripType,
        vehicle_type: vehicleType,
        contact_name: order.contact_name || "",
        contact_phone: order.contact_phone || "",
        delivery_window: deliveryWindow,
        pickup_window: pickupWindow,
        generated_by: user.name,
        items: order.items.map((item) => ({
            name: item.asset_name,
            quantity: item.quantity,
            handling_tags: (item.handling_tags as string[]) || [],
        })),
    });

    return {
        buffer,
        filename: `${order.order_id}-${resolvedFormType.toLowerCase()}.xlsx`,
        form_type: resolvedFormType,
    };
};

// ----------------------------------- SAVE DERIG CAPTURE ------------------------------------
const saveDerigCapture = async (
    orderId: string,
    platformId: string,
    items: { order_item_id: string; media: { url: string; note?: string }[]; note?: string }[],
    user: AuthUser
) => {
    const [order] = await db
        .select({
            id: orders.id,
            order_status: orders.order_status,
            platform_id: orders.platform_id,
        })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)));

    if (!order) throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");

    if (order.order_status !== "DERIG")
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Derig captures can only be saved when order is in DERIG status"
        );

    await db.transaction(async (tx) => {
        for (const item of items) {
            const [existingItem] = await tx
                .select({
                    id: orderItems.id,
                    asset_id: orderItems.asset_id,
                    quantity: orderItems.quantity,
                })
                .from(orderItems)
                .where(
                    and(eq(orderItems.id, item.order_item_id), eq(orderItems.order_id, orderId))
                );

            if (!existingItem) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    `Order item ${item.order_item_id} does not belong to this order`
                );
            }

            const existingDerigEvents = await tx
                .select({ id: scanEvents.id })
                .from(scanEvents)
                .where(
                    and(
                        eq(scanEvents.order_id, orderId),
                        eq(scanEvents.scan_type, "DERIG_CAPTURE"),
                        sql`${scanEvents.metadata} ->> 'order_item_id' = ${item.order_item_id}`
                    )
                );

            const existingEventIds = existingDerigEvents.map((event) => event.id);
            if (existingEventIds.length > 0) {
                await tx
                    .delete(scanEventMedia)
                    .where(inArray(scanEventMedia.scan_event_id, existingEventIds));
                await tx
                    .delete(scanEventAssets)
                    .where(inArray(scanEventAssets.scan_event_id, existingEventIds));
                await tx.delete(scanEvents).where(inArray(scanEvents.id, existingEventIds));
            }

            const [insertedEvent] = await tx
                .insert(scanEvents)
                .values({
                    order_id: orderId,
                    asset_id: existingItem.asset_id,
                    scan_type: "DERIG_CAPTURE",
                    quantity: 0,
                    condition: null,
                    notes: item.note ?? null,
                    discrepancy_reason: null,
                    metadata: {
                        order_item_id: item.order_item_id,
                    },
                    scanned_by: user.id,
                    scanned_at: new Date(),
                })
                .returning({ id: scanEvents.id });

            await tx.insert(scanEventAssets).values({
                scan_event_id: insertedEvent.id,
                asset_id: existingItem.asset_id,
                quantity: existingItem.quantity,
            });

            const normalizedMedia = Array.from(
                new Map(
                    (item.media || [])
                        .map((entry) => ({
                            url: entry.url?.trim(),
                            note: entry.note?.trim() || undefined,
                        }))
                        .filter((entry) => !!entry.url)
                        .map((entry) => [entry.url as string, entry.note])
                ).entries()
            ).map(([url, note]) => ({ url, note }));

            if (normalizedMedia.length > 0) {
                await tx.insert(scanEventMedia).values(
                    normalizedMedia.map((entry, index) => ({
                        scan_event_id: insertedEvent.id,
                        url: entry.url,
                        note: entry.note ?? null,
                        media_kind: "DERIG",
                        sort_order: index,
                    }))
                );
            }
        }
    });

    return { order_id: orderId, items_updated: items.length };
};

// ----------------------------------- SAVE ON-SITE CAPTURE --------------------------------------
const saveOnSiteCapture = async (
    orderId: string,
    platformId: string,
    media: { url: string; note?: string }[],
    assetIds: string[],
    note: string | undefined,
    user: AuthUser
) => {
    const [order] = await db
        .select({
            id: orders.id,
            order_id: orders.order_id,
            order_status: orders.order_status,
            platform_id: orders.platform_id,
        })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)));

    if (!order) throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");

    if (order.order_status !== "IN_USE") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "On Site photos can only be captured when order is IN_USE"
        );
    }

    const orderAssets = await db
        .select({
            asset_id: orderItems.asset_id,
            quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(eq(orderItems.order_id, orderId));

    const orderAssetMap = new Map(orderAssets.map((item) => [item.asset_id, item.quantity]));
    const selectedAssetIds = (assetIds || []).filter((id) => id && id.trim().length > 0);
    if (selectedAssetIds.length > 0) {
        const invalid = selectedAssetIds.filter((id) => !orderAssetMap.has(id));
        if (invalid.length > 0) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Selected asset_ids are not part of this order: ${invalid.join(", ")}`
            );
        }
    }

    const resolvedAssetIds =
        selectedAssetIds.length > 0 ? selectedAssetIds : Array.from(orderAssetMap.keys());

    const normalizedMedia = Array.from(
        new Map(
            (media || [])
                .map((entry) => ({
                    url: entry.url?.trim(),
                    note: entry.note?.trim() || undefined,
                }))
                .filter((entry) => !!entry.url)
                .map((entry) => [entry.url as string, entry.note])
        ).entries()
    ).map(([url, mediaNote]) => ({ url, note: mediaNote }));

    if (normalizedMedia.length === 0) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "At least one On Site photo is required");
    }

    await db.transaction(async (tx) => {
        const existingOnSiteEvents = await tx
            .select({ id: scanEvents.id })
            .from(scanEvents)
            .where(
                and(eq(scanEvents.order_id, orderId), eq(scanEvents.scan_type, "ON_SITE_CAPTURE"))
            );

        const existingIds = existingOnSiteEvents.map((event) => event.id);
        if (existingIds.length > 0) {
            await tx
                .delete(scanEventMedia)
                .where(inArray(scanEventMedia.scan_event_id, existingIds));
            await tx
                .delete(scanEventAssets)
                .where(inArray(scanEventAssets.scan_event_id, existingIds));
            await tx.delete(scanEvents).where(inArray(scanEvents.id, existingIds));
        }

        const [insertedEvent] = await tx
            .insert(scanEvents)
            .values({
                order_id: orderId,
                asset_id: null,
                scan_type: "ON_SITE_CAPTURE",
                quantity: 0,
                condition: null,
                notes: note ?? null,
                discrepancy_reason: null,
                metadata: {},
                scanned_by: user.id,
                scanned_at: new Date(),
            })
            .returning({ id: scanEvents.id });

        if (resolvedAssetIds.length > 0) {
            await tx.insert(scanEventAssets).values(
                resolvedAssetIds.map((assetId) => ({
                    scan_event_id: insertedEvent.id,
                    asset_id: assetId,
                    quantity: orderAssetMap.get(assetId) ?? 0,
                }))
            );
        }

        await tx.insert(scanEventMedia).values(
            normalizedMedia.map((entry, index) => ({
                scan_event_id: insertedEvent.id,
                url: entry.url,
                note: entry.note ?? null,
                media_kind: "ON_SITE",
                sort_order: index,
            }))
        );
    });

    return { order_id: order.order_id, photos_count: normalizedMedia.length, captured_by: user.id };
};

// ----------------------------------- RECALCULATE BASE OPS ------------------------------------
const recalculateBaseOps = async (user: AuthUser, orderId: string, platformId: string) => {
    const [orderRow] = await db
        .select({
            order: orders,
            company: { warehouse_ops_rate: companies.warehouse_ops_rate },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)))
        .limit(1);

    if (!orderRow?.order) throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    const RECALCULATE_ALLOWED_STATUSES = ["PRICING_REVIEW", "PENDING_APPROVAL"];
    if (!RECALCULATE_ALLOWED_STATUSES.includes(orderRow.order.order_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Pricing can only be recalculated during pricing review. Current status: ${orderRow.order.order_status}`
        );
    }
    if (!orderRow.company) throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found");

    const items = await db
        .select({ id: orderItems.id, quantity: orderItems.quantity, asset_id: orderItems.asset_id })
        .from(orderItems)
        .where(eq(orderItems.order_id, orderId));

    const assetIds = items.map((i) => i.asset_id);
    const assetRows =
        assetIds.length > 0
            ? await db
                  .select({
                      id: assets.id,
                      volume_per_unit: assets.volume_per_unit,
                      weight_per_unit: assets.weight_per_unit,
                  })
                  .from(assets)
                  .where(inArray(assets.id, assetIds))
            : [];
    const assetMap = new Map(
        assetRows.map((a) => [
            a.id,
            {
                volume_per_unit: parseFloat(a.volume_per_unit),
                weight_per_unit: parseFloat(a.weight_per_unit),
            },
        ])
    );

    let totalVolume = 0;
    let totalWeight = 0;
    for (const item of items) {
        const asset = assetMap.get(item.asset_id);
        const volumePerUnit = asset?.volume_per_unit || 0;
        const weightPerUnit = asset?.weight_per_unit || 0;
        totalVolume += volumePerUnit * item.quantity;
        totalWeight += weightPerUnit * item.quantity;

        await db
            .update(orderItems)
            .set({
                volume_per_unit: volumePerUnit.toFixed(3),
                weight_per_unit: weightPerUnit.toFixed(2),
                total_volume: (volumePerUnit * item.quantity).toFixed(3),
                total_weight: (weightPerUnit * item.quantity).toFixed(2),
            })
            .where(eq(orderItems.id, item.id));
    }

    const baseOpsTotal = Number(orderRow.company.warehouse_ops_rate) * totalVolume;

    const result = await PricingService.recalculate({
        entity_type: "ORDER",
        entity_id: orderId,
        platform_id: platformId,
        calculated_by: user.id,
        base_ops_total_override: baseOpsTotal,
    });

    const existingTotals = (orderRow.order.calculated_totals || {}) as Record<string, any>;
    await db
        .update(orders)
        .set({
            calculated_totals: {
                ...existingTotals,
                volume: totalVolume.toFixed(3),
                weight: totalWeight.toFixed(2),
            },
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));

    return { volume: totalVolume.toFixed(3), weight: totalWeight.toFixed(2), ...result };
};

export const OrderServices = {
    submitOrderFromCart,
    getOrders,
    getMyOrders,
    getOrderById,
    updateJobNumber,
    getOrderScanEvents,
    progressOrderStatus,
    getOrderStatusHistory,
    updateOrderTimeWindows,
    getPendingApprovalOrders,
    approveQuote,
    declineQuote,
    getClientOrderStatistics,
    sendInvoice,
    submitForApproval,
    adminApproveQuote,
    returnToLogistics,
    cancelOrder,
    calculateEstimate,
    checkMaintenanceFeasibility,
    downloadGoodsForm,
    updateMaintenanceDecision,
    saveDerigCapture,
    saveOnSiteCapture,
    recalculateBaseOps,
};
