import dayjs from "dayjs";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
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
    orderItems,
    orderLineItems,
    orderPrices,
    orders,
    orderStatusHistory,
    reskinRequests,
    scanEvents,
    users,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { sendEmail } from "../../services/email.service";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import {
    SubmitOrderPayload,
    UpdateOrderTimeWindowsPayload,
    ApproveQuotePayload,
    DeclineQuotePayload,
    OrderItem,
    CancelOrderPayload,
    CalculateEstimatePayload,
} from "./order.interfaces";
import {
    checkAssetsForOrder,
    isValidTransition,
    NON_CANCELLABLE_STATUSES,
    orderQueryValidationConfig,
    orderSortableFields,
    PREP_BUFFER_DAYS,
    RETURN_BUFFER_DAYS,
    validateInboundScanningComplete,
    validateRoleBasedTransition,
} from "./order.utils";
import {
    shouldAwaitFabrication,
    recalculateOrderPricing,
} from "./order-pricing.helpers";
import { OrderLineItemsServices } from "../order-line-items/order-line-items.services";
import { ReskinRequestsServices } from "../reskin-requests/reskin-requests.services";
// import { OrderItemsAdjustmentService } from "./order-items-adjustment.service";

// Import asset availability checker
import { multipleEmailSender } from "../../utils/email-sender";
import { emailTemplates } from "../../utils/email-templates";
import { NotificationType } from "../notification-logs/notification-logs.interfaces";
import { NotificationLogServices } from "../notification-logs/notification-logs.services";
import { getNotificationTypeForTransition } from "../notification-logs/notification-logs.utils";
import { orderIdGenerator } from "./order.utils";
import { uuidRegex } from "../../constants/common";
import { getPlatformAdminEmails, getPlatformLogisticsStaffEmails } from "../../utils/helper-query";
import config from "../../config";
import { formatDateForEmail } from "../../utils/date-time";
import { TransportRatesServices } from "../transport-rates/transport-rates.services";

// ----------------------------------- CALCULATE ESTIMATE -------------------------------------
const calculateEstimate = async (
    platformId: string,
    companyId: string,
    payload: CalculateEstimatePayload
) => {
    // Step 1: Extract payload data
    const { items, venue_city, transport_trip_type } = payload;

    // Step 2: Fetch company information
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
    if (!company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found");
    }

    // Step 3: Fetch assets from the database
    const assetIds = items.map((i) => i.asset_id);
    const foundAssets = await db
        .select()
        .from(assets)
        .where(and(inArray(assets.id, assetIds), eq(assets.platform_id, platformId)));

    // Step 4: Calculate total volume of requested assets
    let totalVolume = 0;
    for (const item of items) {
        const asset = foundAssets.find((a) => a.id === item.asset_id);
        if (asset) {
            totalVolume += parseFloat(asset.volume_per_unit) * item.quantity;
        }
    }

    // Step 5: Determine margin and check for rebrand items
    const marginPercent = parseFloat(company.platform_margin_percent);
    const hasRebrandItems = items.some((item) => item.is_reskin_request);

    // Step 6: Lookup transport rate based on venue and trip type
    const transportRateInfo = await TransportRatesServices.lookupTransportRate(
        platformId,
        companyId,
        venue_city,
        transport_trip_type,
        'STANDARD'
    );

    if (!transportRateInfo) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Transport rate not found");
    }

    // Step 7: Calculate logistics subtotal and final estimate
    const warehouseOpsRate = company.warehouse_ops_rate;
    const baseOpsTotal = totalVolume * Number(warehouseOpsRate);
    const baseOpsMarginAmount = baseOpsTotal * (marginPercent / 100);
    const transportRate = Number(transportRateInfo.rate);
    const transportRateMarginAmount = transportRate * (marginPercent / 100);
    const logisticsSubtotal = baseOpsTotal + transportRate;
    const marginAmount = baseOpsMarginAmount + transportRateMarginAmount;
    const estimateTotal = logisticsSubtotal + marginAmount;

    // Step 8: Prepare and return the estimate response
    const estimate = {
        base_operations: {
            volume: parseFloat(totalVolume.toFixed(3)),
            rate: parseFloat(warehouseOpsRate),
            total: parseFloat(baseOpsTotal.toFixed(2)),
        },
        transport: {
            city: venue_city,
            trip_type: transport_trip_type,
            vehicle_type: "STANDARD",
            rate: transportRate,
        },
        logistics_subtotal: parseFloat(logisticsSubtotal.toFixed(2)),
        margin: {
            percent: parseFloat(marginPercent.toFixed(2)),
            base_ops_amount: parseFloat(baseOpsMarginAmount.toFixed(2)),
            transport_rate_amount: parseFloat(transportRateMarginAmount.toFixed(2)),
            total_amount: parseFloat(marginAmount.toFixed(2)),
        },
        estimate_total: parseFloat(estimateTotal.toFixed(2)),
    };

    return {
        ...estimate,
        has_rebrand_items: hasRebrandItems,
        disclaimer: hasRebrandItems
            ? "This estimate excludes rebranding costs, which will be quoted during order review."
            : "Additional services or vehicle requirements may affect the final price.",
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
        transport_trip_type,
        event_start_date,
        event_end_date,
        venue_name,
        venue_country,
        venue_city,
        venue_address,
        contact_name,
        contact_email,
        contact_phone,
        venue_access_notes,
        special_instructions,
    } = payload;

    const tripType = transport_trip_type || "ROUND_TRIP";
    const vehicleType = "STANDARD";
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

    // Step 3: Check assets availability
    const requiredAssets = items.map((i) => ({ id: i.asset_id, quantity: i.quantity }));
    const foundAssets: any[] = await checkAssetsForOrder(
        platformId,
        companyId,
        requiredAssets,
        eventStartDate,
        eventEndDate
    );

    // Step 4: Calculate order totals (volume and weight)
    const orderItemsData: OrderItem[] = [];
    let totalVolume = 0;
    let totalWeight = 0;

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
            is_reskin_request: item.is_reskin_request || false,
            reskin_target_brand_id: item.reskin_target_brand_id || null,
            reskin_target_brand_custom: item.reskin_target_brand_custom || null,
            reskin_notes: item.reskin_notes || null,
        });
    }

    const calculatedVolume = totalVolume.toFixed(3);
    const calculatedWeight = totalWeight.toFixed(2);

    // Step 5: Calculate pricing estimate (NEW SYSTEM)
    const volume = parseFloat(calculatedVolume);

    const transportRateInfo = await TransportRatesServices.lookupTransportRate(
        platformId,
        companyId,
        venue_city,
        tripType,
        vehicleType
    );

    const transportRate = transportRateInfo?.rate ? Number(transportRateInfo.rate) : null;
    const baseOpsTotal = Number(company.warehouse_ops_rate) * volume;
    const logisticsSubTotal = transportRate ? transportRate + baseOpsTotal : null;
    const marginAmount = logisticsSubTotal ? logisticsSubTotal * (Number(company.platform_margin_percent) / 100) : null;
    const finalTotal = logisticsSubTotal && marginAmount ? logisticsSubTotal + marginAmount : null;

    const pricingDetails = {
        platform_id: platformId,
        warehouse_ops_rate: company.warehouse_ops_rate,
        base_ops_total: baseOpsTotal.toFixed(2),
        logistics_sub_total: logisticsSubTotal ? logisticsSubTotal.toFixed(2) : null,
        transport: {
            system_rate: transportRate,
            final_rate: transportRate
        },
        line_items: {
            catalog_total: 0,
            custom_total: 0,
        },
        margin: {
            percent: company.platform_margin_percent,
            amount: marginAmount,
            is_override: false,
            override_reason: null
        },
        final_total: finalTotal ? finalTotal.toFixed(2) : null,
        calculated_at: new Date(),
        calculated_by: user.id,
    }

    // Step 6: Create the order record
    const orderId = await orderIdGenerator();
    const orderResult = await db.transaction(async (tx) => {
        // Step 6.a: Insert order pricing
        const [orderPricing] = await tx
            .insert(orderPrices)
            .values(pricingDetails)
            .returning();

        // Step 6.b: Create the order record
        const [order] = await tx
            .insert(orders)
            .values({
                platform_id: platformId,
                order_id: orderId,
                company_id: companyId,
                brand_id: brand_id || null,
                user_id: user.id,
                contact_name: contact_name,
                contact_email: contact_email,
                contact_phone: contact_phone,
                event_start_date: eventStartDate,
                event_end_date: eventEndDate,
                venue_name: venue_name,
                venue_location: {
                    country: venue_country,
                    address: venue_address,
                    access_notes: venue_access_notes || null,
                },
                special_instructions: special_instructions || null,
                calculated_totals: {
                    volume: calculatedVolume,
                    weight: calculatedWeight,
                },
                transport_trip_type: tripType as any,
                transport_vehicle_type: vehicleType,
                order_pricing_id: orderPricing.id,
                venue_city_id: venue_city,
                order_status: "PRICING_REVIEW",
                financial_status: "PENDING_QUOTE",
            })
            .returning();

        // Step 6.c: Insert order items
        const itemsToInsert = orderItemsData.map((item) => ({
            ...item,
            order_id: order.id,
        }));
        await tx.insert(orderItems).values(itemsToInsert);

        // Step 6.d: Insert order status history
        await tx.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: order.id,
            status: "PRICING_REVIEW",
            notes: `Order created`,
            updated_by: user.id,
        });

        return order;
    });

    // Step 7: Send email to admin, logistics staff and client
    // Step 7.a: Prepare email data
    const emailData = {
        order_id: orderResult.order_id,
        company_name: (company as any)?.name || "N/A",
        event_start_date: formatDateForEmail(event_start_date),
        event_end_date: formatDateForEmail(event_end_date),
        venue_city: venue_city,
        total_volume: calculatedVolume,
        item_count: items.length,
        view_order_url: `${config.client_url}/orders/${orderResult.order_id}`,
    };

    // Step 7.b: Send email to admin
    const platformAdminEmails = await getPlatformAdminEmails(platformId);
    await multipleEmailSender(
        platformAdminEmails,
        `New Order Submitted: ${emailData.order_id}`,
        emailTemplates.submit_order({
            ...emailData,
            by_role: {
                greeting: "Platform Admin",
                message: "A new order has been submitted and requires review.",
                action: "Review this order in the admin dashboard and monitor the pricing workflow.",
            },
        })
    );

    // Step 7.c: Send email to logistics staff
    const logisticsStaffEmails = await getPlatformLogisticsStaffEmails(platformId);
    await multipleEmailSender(
        logisticsStaffEmails,
        `New Order Submitted: ${emailData.order_id}`,
        emailTemplates.submit_order({
            ...emailData,
            by_role: {
                greeting: "Logistics Team",
                message: "A new order has been submitted and requires pricing review.",
                action: "Review the order details and provide pricing within 24-48 hours.",
            },
        })
    );

    // Step 7.d: Send email to client
    await sendEmail({
        to: contact_email,
        subject: `Order Confirmation: ${emailData.order_id}`,
        html: emailTemplates.submit_order({
            ...emailData,
            by_role: {
                greeting: "Client",
                message: "Your order has been successfully submitted.",
                action: "You will receive a quote via email within 24-48 hours. Track your order status in the dashboard.",
            },
        }),
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
                name: cities.name
            },
            order_pricing: {
                warehouse_ops_rate: orderPrices.warehouse_ops_rate,
                base_ops_total: orderPrices.base_ops_total,
                logistics_sub_total: orderPrices.logistics_sub_total,
                transport: orderPrices.transport,
                line_items: orderPrices.line_items,
                margin: orderPrices.margin,
                final_total: orderPrices.final_total,
                calculated_at: orderPrices.calculated_at,
            }
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(brands, eq(orders.brand_id, brands.id))
        .leftJoin(orderPrices, eq(orders.order_pricing_id, orderPrices.id))
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
    const ordersData = results.map((r) => ({
        id: r.order.id,
        order_id: r.order.order_id,
        company: r.company,
        brand: r.brand,
        user_id: r.order.user_id,
        job_number: r.order.job_number,
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
        order_pricing: r.order_pricing,
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
    const conditions: any[] = [eq(orders.platform_id, platformId), eq(orders.user_id, user.id)];

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
                name: cities.name
            },
            order_pricing: {
                warehouse_ops_rate: orderPrices.warehouse_ops_rate,
                base_ops_total: orderPrices.base_ops_total,
                logistics_sub_total: orderPrices.logistics_sub_total,
                transport: orderPrices.transport,
                line_items: orderPrices.line_items,
                margin: orderPrices.margin,
                final_total: orderPrices.final_total,
                calculated_at: orderPrices.calculated_at,
            }
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(brands, eq(orders.brand_id, brands.id))
        .leftJoin(orderPrices, eq(orders.order_pricing_id, orderPrices.id))
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
        company: r.company,
        brand: r.brand,
        order_pricing: r.order_pricing,
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
                name: cities.name
            },
            order_pricing: {
                warehouse_ops_rate: orderPrices.warehouse_ops_rate,
                base_ops_total: orderPrices.base_ops_total,
                logistics_sub_total: orderPrices.logistics_sub_total,
                transport: orderPrices.transport,
                line_items: orderPrices.line_items,
                margin: orderPrices.margin,
                final_total: orderPrices.final_total,
                calculated_at: orderPrices.calculated_at,
            }
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(brands, eq(orders.brand_id, brands.id))
        .leftJoin(users, eq(orders.user_id, users.id))
        .leftJoin(orderPrices, eq(orders.order_pricing_id, orderPrices.id))
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
            order_item: orderItems,
            asset: {
                id: assets.id,
                name: assets.name,
                condition: assets.condition,
                refurbishment_days_estimate: assets.refurb_days_estimate,
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

    const [lineItems, reskinRequests] = await Promise.all([
        OrderLineItemsServices.listOrderLineItems(orderData.order.id, platformId),
        ReskinRequestsServices.listReskinRequests(orderData.order.id, platformId),
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

    return {
        ...orderData.order,
        company: orderData.company,
        brand: orderData.brand,
        user: orderData.user,
        items: itemResults,
        line_items: lineItems,
        reskin_requests: reskinRequests,
        financial_status_history: financialHistory,
        order_status_history: orderHistory,
        venue_city: orderData.venue_city?.name || null,
        order_pricing: orderData.order_pricing,
        invoice:
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
                : null,
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
const getOrderScanEvents = async (orderId: string, platformId: string) => {
    // Step 1: Verify order exists and user has access
    const [order] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.order_id, orderId), eq(orders.platform_id, platformId)));

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 3: Fetch scan events with asset and user details
    const events = await db
        .select({
            scanEvent: scanEvents,
            asset: {
                id: assets.id,
                name: assets.name,
                qr_code: assets.qr_code,
                tracking_method: assets.tracking_method,
            },
            scannedByUser: {
                id: users.id,
                name: users.name,
            },
        })
        .from(scanEvents)
        .leftJoin(assets, eq(scanEvents.asset_id, assets.id))
        .leftJoin(users, eq(scanEvents.scanned_by, users.id))
        .where(eq(scanEvents.order_id, order.id))
        .orderBy(desc(scanEvents.scanned_at));

    // Step 4: Format results
    const formattedResult = events.map((event) => ({
        ...event.scanEvent,
        asset: event.asset,
        scanned_by_user: event.scannedByUser,
        order: {
            id: order.id,
            order_id: order.order_id,
        },
    }));

    // Step 5: Return results
    return formattedResult;
};

// ----------------------------------- PROGRESS ORDER STATUS ----------------------------------
const progressOrderStatus = async (
    orderId: string,
    payload: { new_status: string; notes?: string },
    user: AuthUser,
    platformId: string
) => {
    const { new_status, notes } = payload;

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

    // Step 4.5: Validate date-based transitions
    const today = dayjs().startOf("day");

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

        // Release assets
        await db.delete(assetBookings).where(eq(assetBookings.order_id, orderId));
    }

    // Step 5: Update order status
    await db
        .update(orders)
        .set({
            order_status: new_status as any,
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));

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

    // Step 8: Trigger notification if applicable (asynchronously, don't block response)
    const notificationType = getNotificationTypeForTransition(currentStatus, new_status);

    if (notificationType) {
        await NotificationLogServices.sendNotification(
            platformId,
            notificationType as NotificationType,
            updatedOrder
        );
        console.log(`📧 Notification sent: ${notificationType} for order ${order.order_id}`);
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

    // Step 5: Send notification (Asynchronous)
    await NotificationLogServices.sendNotification(
        platformId,
        "TIME_WINDOWS_UPDATED",
        updatedOrder
    );

    return {
        id: updatedOrder.id,
        order_id: updatedOrder.order_id,
        delivery_window: updatedOrder.delivery_window,
        pickup_window: updatedOrder.pickup_window,
        updated_at: updatedOrder.updated_at,
    };
};

// ----------------------------------- APPROVE QUOTE ----------------------------------------------
const approveQuote = async (
    orderId: string,
    user: AuthUser,
    platformId: string,
    payload: ApproveQuotePayload
) => {
    const { notes } = payload;
    // Step 1: Fetch order with company details
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: true,
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

        // Check if order has pending reskins (NEW) - MOVE OUTSIDE TRANSACTION
    });

    // Check for pending reskins AFTER bookings created
    const hasPendingReskins = await shouldAwaitFabrication(orderId, platformId);
    const nextStatus = hasPendingReskins ? "AWAITING_FABRICATION" : "CONFIRMED";

    // Update order status based on reskins
    await db
        .update(orders)
        .set({
            order_status: nextStatus,
            financial_status: "QUOTE_ACCEPTED",
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));

    // Log status change
    await db.insert(orderStatusHistory).values({
        platform_id: platformId,
        order_id: orderId,
        status: nextStatus,
        notes: hasPendingReskins
            ? "Client approved quote. Order awaiting fabrication completion."
            : notes || "Client approved quote",
        updated_by: user.id,
    });

    await NotificationLogServices.sendNotification(platformId, "QUOTE_APPROVED", order);

    return {
        id: order.id,
        order_id: order.order_id,
        order_status: nextStatus,
        financial_status: "QUOTE_ACCEPTED",
        updated_at: new Date(),
    };
};

// ----------------------------------- DECLINE QUOTE ----------------------------------------------
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

    // Step 4: Update order status to DECLINED and financial status to CANCELLED
    await db
        .update(orders)
        .set({
            order_status: "DECLINED",
            financial_status: "CANCELLED",
            updated_at: new Date(),
        })
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)));

    // Step 5: Log status change in order_status_history
    await db.insert(orderStatusHistory).values({
        platform_id: platformId,
        order_id: orderId,
        status: "DECLINED",
        notes: `Client declined quote: ${decline_reason}`,
        updated_by: user.id,
    });

    // Step 5b: Log financial status change
    await db.insert(financialStatusHistory).values({
        platform_id: platformId,
        order_id: orderId,
        status: "CANCELLED",
        notes: `Quote declined by client: ${decline_reason}`,
        updated_by: user.id,
    });

    // Step 6: Send decline notification (asynchronous, non-blocking)
    await NotificationLogServices.sendNotification(platformId, "QUOTE_DECLINED", order);

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
        "AWAITING_FABRICATION",
        "IN_PREPARATION",
        "READY_FOR_DELIVERY",
        "IN_TRANSIT",
        "DELIVERED",
        "IN_USE",
        "AWAITING_RETURN",
        "RETURN_IN_TRANSIT",
    ];
    const upcomingEventStatuses = ["CONFIRMED", "AWAITING_FABRICATION", "IN_PREPARATION"];

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

const sendInvoice = async (user: AuthUser, platformId: string, orderId: string) => {
    // Step 1: Fetch order with company details
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: true,
        },
    });

    // Step 2: Verify order exists
    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 3: Verify order is in QUOTED status
    if (order.financial_status === "INVOICED") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Order is already invoiced");
    }

    // Step 4: Verify order is in CLOSED status
    if (order.order_status !== "CLOSED") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Order is not in CLOSED status");
    }

    // Step 5: Update order financial status to INVOICED
    await db
        .update(orders)
        .set({
            financial_status: "INVOICED",
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));

    // Step 6: Return updated order details
    return {
        id: order.id,
        order_id: order.order_id,
        financial_status: "INVOICED",
        updated_at: new Date(),
    };
};

// ----------------------------------- SUBMIT FOR APPROVAL (NEW) ------------------------------------
// Logistics submits order for Admin approval (replaces direct quote sending)
const submitForApproval = async (orderId: string, user: AuthUser, platformId: string) => {
    // Get order
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    if (order.order_status !== "PRICING_REVIEW") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order is not in PRICING_REVIEW status. Current status: ${order.order_status}`
        );
    }

    // Recalculate pricing (includes any line items added by Logistics)
    await recalculateOrderPricing(orderId, platformId, order.company_id, user.id);

    // Update order status
    await db
        .update(orders)
        .set({
            order_status: "PENDING_APPROVAL",
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));

    // Log status change
    await db.insert(orderStatusHistory).values({
        platform_id: platformId,
        order_id: orderId,
        status: "PENDING_APPROVAL",
        notes: "Logistics submitted for Admin approval",
        updated_by: user.id,
    });

    const orderForNotification = await db.query.orders.findFirst({
        where: eq(orders.id, orderId),
        with: { company: true },
    });
    if (orderForNotification) {
        await NotificationLogServices.sendNotification(
            platformId,
            "A2_ADJUSTED_PRICING",
            orderForNotification
        );
    }

    return {
        id: order.id,
        order_id: order.order_id,
        order_status: "PENDING_APPROVAL",
        updated_at: new Date(),
    };
};

// ----------------------------------- ADMIN APPROVE QUOTE (NEW) ------------------------------------
// Admin approves pricing and sends quote to client
// const adminApproveQuote = async (
//     orderId: string,
//     user: AuthUser,
//     platformId: string,
//     marginOverride?: { percent: number; reason: string }
// ) => {
//     // Get order
//     const order = await db.query.orders.findFirst({
//         where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
//         with: {
//             company: true,
//         },
//     });

//     if (!order) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
//     }

//     if (order.order_status !== "PENDING_APPROVAL") {
//         throw new CustomizedError(
//             httpStatus.BAD_REQUEST,
//             `Order is not in PENDING_APPROVAL status. Current status: ${order.order_status}`
//         );
//     }

//     // const unprocessedReskins = await db
//     //     .select({ id: orderItems.id })
//     //     .from(orderItems)
//     //     .leftJoin(reskinRequests, eq(reskinRequests.order_item_id, orderItems.id))
//     //     .where(
//     //         and(
//     //             eq(orderItems.order_id, orderId),
//     //             eq(orderItems.is_reskin_request, true),
//     //             isNull(reskinRequests.id)
//     //         )
//     //     );

//     // if (unprocessedReskins.length > 0) {
//     //     throw new CustomizedError(
//     //         httpStatus.BAD_REQUEST,
//     //         "All rebrand requests must be processed before approving the quote"
//     //     );
//     // }

//     // Recalculate pricing with margin override if provided
//     const company = order.company as typeof companies.$inferSelect | null;
//     const marginPercent =
//         marginOverride?.percent ?? parseFloat(company?.platform_margin_percent || "0");
//     const volume = parseFloat((order.calculated_totals as any).volume);
//     const emirate = PricingCalculationServices.deriveEmirateFromCity(
//         (order.venue_location as any).city
//     );

//     const finalPricing = await PricingCalculationServices.calculateOrderPricing(
//         platformId,
//         order.company_id,
//         orderId,
//         volume,
//         emirate,
//         order.transport_trip_type,
//         order.transport_vehicle_type,
//         marginPercent,
//         !!marginOverride,
//         marginOverride?.reason || null,
//         user.id
//     );

//     // Determine if this is a revised quote (order was previously quoted)
//     const isRevisedQuote = ["QUOTE_SENT", "QUOTE_REVISED"].includes(order.financial_status);
//     const newFinancialStatus = isRevisedQuote ? "QUOTE_REVISED" : "QUOTE_SENT";

//     // Update order
//     await db
//         .update(orders)
//         .set({
//             order_status: "QUOTED",
//             financial_status: newFinancialStatus,
//             pricing: finalPricing as any,
//             updated_at: new Date(),
//         })
//         .where(eq(orders.id, orderId));

//     // Log status change
//     await db.insert(orderStatusHistory).values({
//         platform_id: platformId,
//         order_id: orderId,
//         status: "QUOTED",
//         notes: marginOverride
//             ? `Admin approved with margin override (${marginOverride.percent}%): ${marginOverride.reason}`
//             : isRevisedQuote
//                 ? "Admin approved revised quote"
//                 : "Admin approved quote",
//         updated_by: user.id,
//     });

//     // Log financial status change
//     await db.insert(financialStatusHistory).values({
//         platform_id: platformId,
//         order_id: orderId,
//         status: newFinancialStatus,
//         notes: isRevisedQuote ? "Revised quote sent to client" : "Quote sent to client",
//         updated_by: user.id,
//     });

//     const orderForNotification = await db.query.orders.findFirst({
//         where: eq(orders.id, orderId),
//         with: { company: true },
//     });
//     if (orderForNotification) {
//         await NotificationLogServices.sendNotification(platformId, "QUOTE_SENT", orderForNotification);
//     }

//     return {
//         id: order.id,
//         order_id: order.order_id,
//         order_status: "QUOTED",
//         financial_status: "QUOTE_SENT",
//         final_total: finalPricing.final_total,
//         updated_at: new Date(),
//     };
// };

// ----------------------------------- RETURN TO LOGISTICS (NEW) ------------------------------------
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

    console.log("payload", payload);
    console.log("orderId", orderId);
    console.log("platformId", platformId);
    console.log("user", user);

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

    let cancelledReskinsCount = 0; // Store count before transaction ends

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

        // 2. Release all asset bookings
        await tx.delete(assetBookings).where(eq(assetBookings.order_id, orderId));

        // 3. Cancel any pending reskin requests
        const pendingReskins = await tx
            .select()
            .from(reskinRequests)
            .where(
                and(
                    eq(reskinRequests.order_id, orderId),
                    isNull(reskinRequests.completed_at),
                    isNull(reskinRequests.cancelled_at)
                )
            );

        cancelledReskinsCount = pendingReskins.length; // Store count

        for (const reskin of pendingReskins) {
            // Mark reskin as cancelled
            await tx
                .update(reskinRequests)
                .set({
                    cancelled_at: new Date(),
                    cancelled_by: user.id,
                    cancellation_reason: "Order cancelled",
                })
                .where(eq(reskinRequests.id, reskin.id));

            // Void linked line items
            await tx
                .update(orderLineItems)
                .set({
                    is_voided: true,
                    voided_at: new Date(),
                    voided_by: user.id,
                    void_reason: "Order cancelled",
                })
                .where(eq(orderLineItems.reskin_request_id, reskin.id));
        }

        // 4. Log to order status history
        await tx.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "CANCELLED",
            notes: `${reason}: ${notes}`,
            updated_by: user.id,
        });

        // 5. Log to financial status history
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
        if (notify_client) {
            await NotificationLogServices.sendNotification(
                platformId,
                "ORDER_CANCELLED",
                orderForNotification,
                { to: [orderForNotification.contact_email] },
                { cancellation_reason: reason, cancellation_notes: notes }
            );
        }

        await NotificationLogServices.sendNotification(
            platformId,
            "ORDER_CANCELLED",
            orderForNotification,
            undefined,
            { cancellation_reason: reason, cancellation_notes: notes }
        );
    }

    return {
        success: true,
        order_id: order.order_id,
        cancelled_reskins: cancelledReskinsCount, // ✅ Now in scope
    };
}

// ----------------------------------- GET PENDING APPROVAL ORDERS (NEW) ------------------------------------
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
                reskin_requests: true,
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

// ---------------- Update order vehicle type and recalculate transport rate ----------------
// export async function updateOrderVehicle(
//     orderId: string,
//     platformId: string,
//     payload: UpdateVehiclePayload,
//     userId: string
// ) {
//     const { vehicle_type, reason } = payload;

//     // Validate reason if changing vehicle
//     if (!reason || reason.trim().length < 10) {
//         throw new CustomizedError(
//             httpStatus.BAD_REQUEST,
//             "Vehicle change reason is required (min 10 characters)"
//         );
//     }

//     // Get order
//     const order = await db.query.orders.findFirst({
//         where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
//     });

//     if (!order) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
//     }

//     // Validate order status
//     if (!["PRICING_REVIEW", "PENDING_APPROVAL"].includes(order.order_status)) {
//         throw new CustomizedError(
//             httpStatus.BAD_REQUEST,
//             "Vehicle type can only be changed during pricing review"
//         );
//     }

//     // Get new transport rate
//     const emirate = PricingCalculationServices.deriveEmirateFromCity(
//         (order.venue_location as any).city
//     );
//     const newRate = await TransportRatesServices.getTransportRate(
//         platformId,
//         order.company_id,
//         emirate,
//         order.transport_trip_type,
//         vehicle_type
//     );

//     // Update order
//     await db
//         .update(orders)
//         .set({
//             transport_vehicle_type: vehicle_type as any,
//             // Update pricing JSONB if it exists
//             pricing: order.pricing
//                 ? {
//                     ...(order.pricing as any),
//                     transport: {
//                         ...(order.pricing as any).transport,
//                         vehicle_type,
//                         final_rate: newRate,
//                         vehicle_changed: vehicle_type !== "STANDARD",
//                         vehicle_change_reason: reason.trim(),
//                     },
//                 }
//                 : null,
//             updated_at: new Date(),
//         })
//         .where(eq(orders.id, orderId));

//     return {
//         vehicle_type,
//         new_rate: newRate,
//         reason: reason.trim(),
//     };
// }

// ----------------------------------- ADJUST LOGISTICS PRICING -------------------------------
// const adjustLogisticsPricing = async (
//     orderId: string,
//     user: AuthUser,
//     platformId: string,
//     payload: AdjustLogisticsPricingPayload
// ) => {
//     // Step 1: Fetch order and verify it exists
//     const order = await db.query.orders.findFirst({
//         where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
//         with: {
//             company: true,
//         },
//     });

//     if (!order) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
//     }

//     // Step 2: Verify order is in PRICING_REVIEW status
//     if (order.order_status !== "PRICING_REVIEW") {
//         throw new CustomizedError(httpStatus.BAD_REQUEST, "Order is not in PRICING_REVIEW status");
//     }

//     // Step 3: Get base price from logistics_pricing or calculate from tier
//     const platformPricing = order.platform_pricing as any;
//     const logisticsPricing = order.logistics_pricing as any;
//     const basePrice = logisticsPricing?.base_price || null;

//     // Step 4: Update logistics_pricing JSONB field
//     const updatedLogisticsPricing = {
//         base_price: basePrice,
//         adjusted_price: payload.adjusted_price,
//         adjustment_reason: payload.adjustment_reason,
//         adjusted_at: new Date().toISOString(),
//         adjusted_by: user.email,
//     };

//     // Step 5: Update order
//     const orderCompany: any = order.company; // ✅ FIX: Type assertion
//     await db
//         .update(orders)
//         .set({
//             logistics_pricing: updatedLogisticsPricing,
//             platform_pricing: {
//                 ...platformPricing,
//                 margin_percent: orderCompany.platform_margin_percent,
//                 margin_amount:
//                     Number(updatedLogisticsPricing.adjusted_price) *
//                     (Number(orderCompany.platform_margin_percent) / 100),
//             },
//             order_status: "PENDING_APPROVAL",
//             updated_at: new Date(),
//         })
//         .where(eq(orders.id, orderId));

//     // Step 6: Log status change in order_status_history
//     await db.insert(orderStatusHistory).values({
//         platform_id: platformId,
//         order_id: orderId,
//         status: "PENDING_APPROVAL",
//         notes: `Logistics pricing adjusted: ${payload.adjustment_reason}`,
//         updated_by: user.id,
//     });

//     // Step 7: Send notification to plaform admin
//     const platformAdmins = await db
//         .select({ email: users.email })
//         .from(users)
//         .where(
//             and(
//                 eq(users.platform_id, platformId),
//                 eq(users.role, "ADMIN"),
//                 sql`${users.permission_template} = 'PLATFORM_ADMIN' AND ${users.email} NOT LIKE '%@system.internal'`
//             )
//         );

//     const platformAdminEmails = platformAdmins.map((admin) => admin.email);

//     // TODO: Change URL
//     await multipleEmailSender(
//         platformAdminEmails,
//         `Action Required: Order ${order.order_id} - Logistics Pricing Adjustment`,
//         emailTemplates.adjust_price({
//             order_id: order.order_id,
//             company_name: (order.company as any).name,
//             adjusted_price: updatedLogisticsPricing.adjusted_price,
//             adjustment_reason: updatedLogisticsPricing.adjustment_reason,
//             view_order_url: `http://localhost:3000/order/${order.order_id}`,
//         })
//     );

//     return {
//         id: order.id,
//         order_id: order.order_id,
//         order_status: "PENDING_APPROVAL",
//         base_price: updatedLogisticsPricing.base_price,
//         adjusted_price: updatedLogisticsPricing.adjusted_price,
//         adjustment_reason: updatedLogisticsPricing.adjustment_reason,
//         adjusted_at: updatedLogisticsPricing.adjusted_at,
//         adjusted_by: {
//             id: updatedLogisticsPricing.adjusted_by,
//             name: user.name,
//         },
//         company: {
//             id: (order.company as any).id,
//             name: (order.company as any).name,
//         },
//     };
// };

// ----------------------------------- GET PRICING REVIEW ORDERS ------------------------------
// const getPricingReviewOrders = async (query: any, platformId: string) => {
//     const { search_term, page, limit, sort_by, sort_order, company_id, date_from, date_to } = query;

//     // Step 1: Validate query parameters
//     if (sort_by) queryValidator(orderQueryValidationConfig, "sort_by", sort_by);
//     if (sort_order) queryValidator(orderQueryValidationConfig, "sort_order", sort_order);

//     // Step 2: Setup pagination
//     const { pageNumber, limitNumber, skip, sortWith, sortSequence } = paginationMaker({
//         page,
//         limit,
//         sort_by,
//         sort_order,
//     });

//     // Step 3: Build WHERE conditions
//     const conditions: any[] = [
//         eq(orders.platform_id, platformId),
//         eq(orders.order_status, "PRICING_REVIEW"),
//     ];

//     // Step 3b: Optional filters
//     if (search_term && search_term.trim().length > 0) {
//         conditions.push(ilike(orders.order_id, `%${search_term.trim()}%`));
//     }

//     if (company_id) {
//         conditions.push(eq(orders.company_id, company_id));
//     }

//     if (date_from) {
//         const fromDate = new Date(date_from);
//         if (isNaN(fromDate.getTime())) {
//             throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date_from format");
//         }
//         conditions.push(gte(orders.created_at, fromDate));
//     }

//     if (date_to) {
//         const toDate = new Date(date_to);
//         if (isNaN(toDate.getTime())) {
//             throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date_to format");
//         }
//         conditions.push(lte(orders.created_at, toDate));
//     }

//     // Step 3c: Search functionality
//     if (search_term) {
//         const searchConditions = [
//             ilike(orders.order_id, `%${search_term}%`),
//             ilike(orders.contact_name, `%${search_term}%`),
//             ilike(orders.venue_name, `%${search_term}%`),
//             // Subquery for asset names in orderItems
//             sql`EXISTS (
// 				SELECT 1 FROM ${orderItems}
// 				WHERE ${orderItems.order_id} = ${orders.id}
// 				AND ${orderItems.asset_name} ILIKE ${`%${search_term}%`}
// 			)`,
//         ];
//         conditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
//     }

//     // Step 4: Determine sort field
//     const sortField = orderSortableFields[sortWith] || orders.created_at;

//     // Step 5: Fetch orders with company and brand information
//     const results = await db
//         .select({
//             order: orders,
//             company: {
//                 id: companies.id,
//                 name: companies.name,
//             },
//         })
//         .from(orders)
//         .leftJoin(companies, eq(orders.company_id, companies.id))
//         .where(and(...conditions))
//         .orderBy(sortSequence === "asc" ? asc(sortField) : desc(sortField))
//         .limit(limitNumber)
//         .offset(skip);

//     // Step 6: Get total count
//     const [countResult] = await db
//         .select({ count: count() })
//         .from(orders)
//         .where(and(...conditions));

//     // Step 7: Flag orders with reskin requests
//     const orderIds = results.map((r) => r.order.id);
//     const reskinOrderIds = new Set<string>();
//     if (orderIds.length > 0) {
//         const reskinItems = await db
//             .select({ order_id: orderItems.order_id })
//             .from(orderItems)
//             .where(and(inArray(orderItems.order_id, orderIds), eq(orderItems.is_reskin_request, true)));
//         reskinItems.forEach((item) => reskinOrderIds.add(item.order_id));
//     }

//     const enhancedResults = results.map((result) => {
//         const order = result.order;
//         return {
//             id: order.id,
//             order_id: order.order_id,
//             company: {
//                 id: result.company?.id,
//                 name: result.company?.name,
//             },
//             contact_name: order.contact_name,
//             event_start_date: order.event_start_date,
//             venue_name: order.venue_name,
//             venue_location: order.venue_location,
//             calculated_volume: (order.calculated_totals as any)?.volume,
//             calculated_weight: (order.calculated_totals as any)?.weight,
//             status: order.order_status,
//             createdAt: order.created_at,
//             pricing: order.pricing || null,
//             transport_trip_type: order.transport_trip_type,
//             transport_vehicle_type: order.transport_vehicle_type,
//             has_reskin_requests: reskinOrderIds.has(order.id),
//         };
//     });

//     return {
//         data: enhancedResults,
//         meta: {
//             page: pageNumber,
//             limit: limitNumber,
//             total: countResult.count,
//         },
//     };
// };

// ----------------------------------- GET ORDER PRICING DETAILS ------------------------------
// const getOrderPricingDetails = async (orderId: string, platformId: string) => {
//     const order = await db.query.orders.findFirst({
//         where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
//         with: {
//             company: true,
//         },
//     });

//     if (!order) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
//     }

//     const company = order.company as typeof companies.$inferSelect | null;
//     const [lineItems, reskinRequests] = await Promise.all([
//         OrderLineItemsServices.listOrderLineItems(orderId, platformId),
//         ReskinRequestsServices.listReskinRequests(orderId, platformId),
//     ]);

//     return {
//         order: {
//             id: order.id,
//             order_id: order.order_id,
//             calculated_volume: (order.calculated_totals as any)?.volume || null,
//             venue_location: order.venue_location,
//             transport_trip_type: order.transport_trip_type,
//             transport_vehicle_type: order.transport_vehicle_type,
//             company: {
//                 id: company?.id || "",
//                 name: company?.name || "N/A",
//                 platform_margin_percent: company?.platform_margin_percent || "0",
//             },
//         },
//         pricing: order.pricing || null,
//         line_items: lineItems,
//         reskin_requests: reskinRequests,
//     };
// };

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
    // NEW FUNCTIONS
    submitForApproval,
    // adminApproveQuote,
    returnToLogistics,
    cancelOrder,
    calculateEstimate,
    // updateOrderVehicle,
    // addOrderItem: OrderItemsAdjustmentService.addOrderItem,
    // removeOrderItem: OrderItemsAdjustmentService.removeOrderItem,
    // updateOrderItemQuantity: OrderItemsAdjustmentService.updateOrderItemQuantity,
    // adjustLogisticsPricing,
    // getPricingReviewOrders,
    // getOrderPricingDetails,
};
