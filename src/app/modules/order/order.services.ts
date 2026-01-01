import dayjs from "dayjs";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    assetBookings,
    assets,
    brands,
    collections,
    companies,
    orderItems,
    orders,
    orderStatusHistory,
    pricingTiers,
    scanEvents,
    users
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { sendEmail } from "../../services/email.service";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { AdjustLogisticsPricingPayload, ApproveStandardPricingPayload, ApprovePlatformPricingPayload, OrderItem, OrderSubmittedEmailData, StandardPricing, SubmitOrderPayload, UpdateOrderTimeWindowsPayload } from "./order.interfaces";
import { calculateBlockedPeriod, isValidTransition, orderQueryValidationConfig, orderSortableFields, validateInboundScanningComplete, validateRoleBasedTransition } from "./order.utils";

// Import asset availability checker
import { multipleEmailSender } from "../../utils/email-sender";
import { emailTemplates } from "../../utils/email-templates";
import { checkMultipleAssetsAvailability, getAssetAvailabilitySummary } from "../asset/assets.services";
import { NotificationType } from "../notification-logs/notification-logs.interfaces";
import { NotificationLogServices } from "../notification-logs/notification-logs.services";
import { getNotificationTypeForTransition } from "../notification-logs/notification-logs.utils";
import { orderIdGenerator, renderOrderSubmittedEmail } from "./order.utils";

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
    // Extract all required fields from the payload
    const { items, brand_id, event_start_date, event_end_date, venue_name, venue_country, venue_city, venue_address, contact_name, contact_email, contact_phone, venue_access_notes, special_instructions } = payload;

    // Step 1: Validate event dates
    const eventStart = new Date(event_start_date);
    const eventEnd = new Date(event_end_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (eventStart < today) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Event start date cannot be in the past");
    }

    if (eventEnd < eventStart) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Event end date must be on or after start date");
    }

    const [company] = await db.select().from(companies).where(and(eq(companies.id, companyId), eq(companies.platform_id, platformId)));

    if (!company) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Company not found");
    }

    // Step 2: Verify all assets exist and belong to the company
    const assetIds = items.map((item: OrderItem) => item.asset_id);
    const foundAssets = await db
        .select()
        .from(assets)
        .where(
            and(
                inArray(assets.id, assetIds),
                eq(assets.company_id, companyId),
                eq(assets.platform_id, platformId),
                isNull(assets.deleted_at)
            )
        );

    if (foundAssets.length !== assetIds.length) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "One or more assets not found or do not belong to your company"
        );
    }

    // Step 3: Check asset status - all must be AVAILABLE
    const unavailableAssets = foundAssets.filter((a) => a.status !== "AVAILABLE");
    if (unavailableAssets.length > 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot order unavailable assets: ${unavailableAssets.map((a) => a.name).join(", ")}`
        );
    }

    // Step 4: Check date-based availability for requested quantities
    const itemsForAvailabilityCheck = payload.items.map((item: OrderItem) => ({
        asset_id: item.asset_id,
        quantity: item.quantity,
    }));

    const availabilityCheck = await checkMultipleAssetsAvailability(itemsForAvailabilityCheck, eventStart, eventEnd, user, platformId);

    if (!availabilityCheck.all_available) {
        const unavailableList = availabilityCheck.unavailable_items
            .map(({ asset_name, requested, available, next_available_date }) => {
                const nextDate = next_available_date
                    ? ` (available from ${new Date(next_available_date).toLocaleDateString()})`
                    : "";

                return `${asset_name}: requested ${requested}, available ${available}${nextDate}`;
            })
            .join("; ");

        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Insufficient availability for requested dates: ${unavailableList}`
        );
    }

    // Step 5: Calculate order totals (volume and weight)
    const orderItemsData = [];
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
                .where(and(eq(collections.id, item.from_collection_id), eq(collections.platform_id, platformId)));
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
        });
    }

    const calculatedVolume = totalVolume.toFixed(3);
    const calculatedWeight = totalWeight.toFixed(2);

    // Step 6: Find matching pricing tier based on location and volume
    const volume = parseFloat(calculatedVolume);
    const matchingTiers = await db
        .select()
        .from(pricingTiers)
        .where(
            and(
                eq(pricingTiers.platform_id, platformId),
                sql`LOWER(${pricingTiers.country}) = LOWER(${venue_country})`,
                sql`LOWER(${pricingTiers.city}) = LOWER(${venue_city})`,
                eq(pricingTiers.is_active, true),
                lte(sql`CAST(${pricingTiers.volume_min} AS DECIMAL)`, volume),
                sql`CAST(${pricingTiers.volume_max} AS DECIMAL) > ${volume}`
            )
        )
        .orderBy(
            sql`CAST(${pricingTiers.volume_max} AS DECIMAL) - CAST(${pricingTiers.volume_min} AS DECIMAL)`
        )
        .limit(1);

    const pricingTier = matchingTiers[0] || null;

    // Step 7: Create the order record
    const orderId = await orderIdGenerator();

    const [order] = await db
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
            event_start_date: eventStart,
            event_end_date: eventEnd,
            venue_name: venue_name,
            venue_location: {
                country: venue_country,
                city: venue_city,
                address: venue_address,
                access_notes: venue_access_notes || null,
            },
            special_instructions: special_instructions || null,
            calculated_totals: {
                volume: calculatedVolume,
                weight: calculatedWeight,
            },
            order_status: "PRICING_REVIEW",
            financial_status: "PENDING_QUOTE",
            tier_id: pricingTier?.id || null,
            ...(pricingTier && { logistics_pricing: { base_price: pricingTier.base_price } }),
            ...(pricingTier && {
                platform_pricing: {
                    margin_percent: company.platform_margin_percent,
                    margin_amount: Number(pricingTier.base_price) * (Number(company.platform_margin_percent) / 100)
                }
            }),
        })
        .returning();

    // Step 8: Insert order items with snapshot data
    const itemsToInsert = orderItemsData.map((item) => ({
        ...item,
        order_id: order.id
    }));

    await db.insert(orderItems).values(itemsToInsert);

    // Step 9: Prepare email notification data

    const emailData = {
        orderId: order.order_id,
        companyName: company?.name || "",
        eventStartDate: dayjs(eventStart).format("YYYY-MM-DD"),
        eventEndDate: dayjs(eventEnd).format("YYYY-MM-DD"),
        venueCity: venue_city,
        totalVolume: calculatedVolume,
        itemCount: items.length,
        viewOrderUrl: `http://localhost:3000/orders/${order.order_id}`,
    };

    // Step 10: Send email notifications
    const platformAdmins = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(
            and(
                eq(users.platform_id, platformId),
                sql`(
                    ${users.permission_template} = 'PLATFORM_ADMIN'
                    OR 'orders:receive_notifications' = ANY(${users.permissions})
                ) AND ${users.email} NOT LIKE '%@system.internal'`
            )
        );

    const platformAdminEmails = platformAdmins.map((admin) => admin.email);

    await multipleEmailSender(platformAdminEmails, `New Order Submitted: ${emailData.orderId}`, emailTemplates.submit_order({
        order_id: emailData.orderId,
        company_name: emailData.companyName,
        event_start_date: emailData.eventStartDate,
        event_end_date: emailData.eventEndDate,
        venue_city: emailData.venueCity,
        total_volume: emailData.totalVolume,
        item_count: emailData.itemCount || 0,
        view_order_url: emailData.viewOrderUrl,
        by_role: {
            greeting: "Platform Admin",
            message: "A new order has been submitted and requires review.",
            action: "Review this order in the admin dashboard and monitor the pricing workflow.",
        }
    }));

    // Find Logistics (permission_template = 'LOGISTICS_STAFF' OR 'orders:receive_notifications' in permissions)
    const logisticsStaff = await db
        .select({ email: users.email, name: users.name })
        .from(users)
        .where(
            and(
                eq(users.platform_id, platformId),
                sql`(
                    ${users.permission_template} = 'LOGISTICS_STAFF'
                    OR 'orders:receive_notifications' = ANY(${users.permissions})
                ) AND ${users.email} NOT LIKE '%@system.internal'`
            )
        );

    const logisticsStaffEmails = logisticsStaff.map((staff) => staff.email);

    await multipleEmailSender(logisticsStaffEmails, `New Order Submitted: ${emailData.orderId}`, renderOrderSubmittedEmail("LOGISTICS_STAFF", emailData));

    await sendOrderSubmittedConfirmationToClient(
        contact_email,
        emailData
    );

    // Step 11: Return order details to client
    return {
        order_id: order.order_id,
        status: order.order_status,
        company_name: company?.name || "",
        calculated_volume: calculatedVolume,
        item_count: items.length,
    };
};

// ----------------------------------- HELPER: SEND ORDER SUBMITTED NOTIFICATIONS -------------
const sendOrderSubmittedNotifications = async (data: OrderSubmittedEmailData): Promise<void> => {
    try {
        // Find Platform Admins (permission_template = 'PLATFORM_ADMIN' OR 'orders:receive_notifications' in permissions)
        const platformAdmins = await db
            .select({ email: users.email, name: users.name })
            .from(users)
            .where(
                sql`(
                    ${users.permission_template} = 'PLATFORM_ADMIN'
                    OR 'orders:receive_notifications' = ANY(${users.permissions})
                ) AND ${users.email} NOT LIKE '%@system.internal'`
            );

        // Find Logistics (permission_template = 'LOGISTICS_STAFF' OR 'orders:receive_notifications' in permissions)
        const logisticsStaff = await db
            .select({ email: users.email, name: users.name })
            .from(users)
            .where(
                sql`(
                    ${users.permission_template} = 'LOGISTICS_STAFF'
                    OR 'orders:receive_notifications' = ANY(${users.permissions})
                ) AND ${users.email} NOT LIKE '%@system.internal'`
            );

        // Send emails to Platform Admins
        const platformAdminPromises = platformAdmins.map(async (admin) => {
            const html = renderOrderSubmittedEmail("PLATFORM_ADMIN", data);
            return sendEmail({
                to: admin.email,
                subject: `New Order Submitted: ${data.orderId}`,
                html,
            });
        });

        // Send emails to Logistics Staff
        const logisticsStaffPromises = logisticsStaff.map(async (staff) => {
            const html = renderOrderSubmittedEmail("LOGISTICS_STAFF", data);
            return sendEmail({
                to: staff.email,
                subject: `New Order Submitted: ${data.orderId}`,
                html,
            });
        });

        // Send all emails concurrently
        await Promise.all([...logisticsStaffPromises, ...platformAdminPromises]);

        console.log(`Order submission notifications sent for order ${data.orderId}`);
    } catch (error) {
        // Log error but don't throw - email failures shouldn't block order submission
        console.error("Error sending order submission notifications:", error);
    }
};

// ----------------------------------- HELPER: SEND ORDER CONFIRMATION TO CLIENT --------------
const sendOrderSubmittedConfirmationToClient = async (
    clientEmail: string,
    data: OrderSubmittedEmailData
): Promise<void> => {
    try {
        const html = renderOrderSubmittedEmail("CLIENT_USER", data);

        await sendEmail({
            to: clientEmail,
            subject: `Order Confirmation: ${data.orderId}`,
            html,
        });

        console.log(`Order confirmation sent to client: ${clientEmail}`);
    } catch (error) {
        // Log error but don't throw - email failures shouldn't block order submission
        console.error("Error sending order confirmation to client:", error);
    }
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
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
        paginationMaker({
            page,
            limit,
            sort_by,
            sort_order,
        });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(orders.platform_id, platformId)];

    // Step 3a: Filter by user role (CLIENT users see only their company's orders)
    if (user.role === 'CLIENT') {
        if (user.company_id) {
            conditions.push(eq(orders.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3b: Optional filters
    if (company_id) {
        conditions.push(eq(orders.company_id, company_id));
    }

    if (brand_id) {
        conditions.push(eq(orders.brand_id, brand_id));
    }

    if (order_status) {
        queryValidator(orderQueryValidationConfig, 'order_status', order_status);
        conditions.push(eq(orders.order_status, order_status));
    }

    if (financial_status) {
        queryValidator(orderQueryValidationConfig, 'financial_status', financial_status);
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
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(brands, eq(orders.brand_id, brands.id))
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
    const orderIds = results.map(r => r.order.id);
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
        itemResults.forEach(item => {
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
    const ordersData = results.map(r => ({
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
        venue_location: r.order.venue_location,
        calculated_totals: r.order.calculated_totals,
        order_status: r.order.order_status,
        financial_status: r.order.financial_status,
        tier_id: r.order.tier_id,
        created_at: r.order.created_at,
        updated_at: r.order.updated_at,
        item_count: itemCounts[r.order.id] || 0,
        item_preview: itemPreviews[r.order.id] || [],
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
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
        paginationMaker({
            page,
            limit,
            sort_by,
            sort_order,
        });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(orders.platform_id, platformId), eq(orders.user_id, user.id)];

    // Step 3a: Filter by user role (CLIENT users see only their company's orders)
    if (user.role === 'CLIENT') {
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
        queryValidator(orderQueryValidationConfig, 'order_status', order_status);
        conditions.push(eq(orders.order_status, order_status));
    }

    if (financial_status) {
        queryValidator(orderQueryValidationConfig, 'financial_status', financial_status);
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
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(brands, eq(orders.brand_id, brands.id))
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
        company: r.company,
        brand: r.brand,
    }))

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
const getOrderById = async (orderId: string, user: AuthUser, platformId: string) => {
    // Step 1: Fetch order with relations
    const result = await db
        .select({
            order: orders,
            company: {
                id: companies.id,
                name: companies.name,
                platform_margin_percent: companies.platform_margin_percent
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
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(brands, eq(orders.brand_id, brands.id))
        .leftJoin(users, eq(orders.user_id, users.id))
        .where(and(
            eq(orders.order_id, orderId),
            eq(orders.platform_id, platformId)
        ))
        .limit(1);

    if (result.length === 0) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    const orderData = result[0];

    // Check access based on user role
    if (user.role === 'CLIENT') {
        if (user.company_id !== orderData.order.company_id) {
            throw new CustomizedError(httpStatus.FORBIDDEN, "You don't have access to this order");
        }
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

    return {
        ...orderData.order,
        company: orderData.company,
        brand: orderData.brand,
        user: orderData.user,
        items: itemResults,
    };
};

// ----------------------------------- UPDATE JOB NUMBER --------------------------------------
const updateJobNumber = async (
    orderId: string,
    jobNumber: string | null,
    platformId: string
) => {
    // Step 1: Verify order exists
    const [order] = await db
        .select()
        .from(orders)
        .where(and(
            eq(orders.id, orderId),
            eq(orders.platform_id, platformId)
        ));

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 4: Update job number
    const [updatedOrder] = await db
        .update(orders)
        .set({
            job_number: jobNumber,
            updated_at: new Date()
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
        .where(and(
            eq(orders.order_id, orderId),
            eq(orders.platform_id, platformId)
        ));

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
            order_id: order.order_id
        }
    }))

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

    // Step 1: Get order with company details and items
    const order = await db.query.orders.findFirst({
        where: and(
            eq(orders.id, orderId),
            eq(orders.platform_id, platformId)
        ),
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
    if (user.role === 'CLIENT') {
        if (user.company_id !== order.company_id) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "You do not have access to this order"
            );
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

    // Step 5: Handle special side effects based on transitions
    if (new_status === 'CONFIRMED') {
        if (!order.event_start_date || !order.event_end_date) {
            throw new Error('Order must have event dates')
        }

        // Create booking for each item
        for (const item of order.items) {
            const refurbDays = item.asset.refurb_days_estimate || 0
            await createBooking(
                item.asset.id,
                orderId,
                item.quantity,
                order.event_start_date,
                order.event_end_date,
                refurbDays,
                user,
                platformId
            )
        }
    }

    if (new_status === 'CLOSED') {
        // Validate that all items have been scanned in (inbound)
        const allItemsScanned = await validateInboundScanningComplete(orderId);

        if (!allItemsScanned) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                'Cannot close order: Inbound scanning is not complete. All items must be scanned in before closing the order.'
            );
        }

        // Release assets
        await db
            .delete(assetBookings)
            .where(eq(assetBookings.order_id, orderId));
    }

    // Step 6: Update order status
    await db
        .update(orders)
        .set({
            order_status: new_status as any,
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));

    // Step 7: Create status history entry
    await db.insert(orderStatusHistory).values({
        platform_id: platformId,
        order_id: orderId,
        status: new_status as any,
        notes: notes || null,
        updated_by: user.id,
    });

    // Step 8: Get updated order
    const [updatedOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId));

    // Step 9: Trigger notification if applicable (asynchronously, don't block response)
    const notificationType = getNotificationTypeForTransition(currentStatus, new_status);

    if (notificationType) {
        // TODO: Send notification asynchronously
        await NotificationLogServices.sendNotification(platformId, notificationType as NotificationType, updatedOrder);
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

export async function createBooking(
    assetId: string,
    orderId: string,
    quantity: number,
    eventStartDate: Date,
    eventEndDate: Date,
    refurbDays: number = 0,
    user: AuthUser,
    platformId: string
): Promise<void> {
    // Calculate blocked period with buffers
    const { blockedFrom, blockedUntil } = calculateBlockedPeriod(
        eventStartDate,
        eventEndDate,
        refurbDays
    )

    // Check availability first
    const availability = await getAssetAvailabilitySummary(
        assetId,
        blockedFrom,
        blockedUntil,
        user,
        platformId
    )

    if (availability.available_quantity < quantity) {
        throw new Error(
            `Insufficient availability for asset. Available: ${availability.available_quantity}, Requested: ${quantity}`
        )
    }

    // Create booking
    await db.insert(assetBookings).values({
        asset_id: assetId,
        order_id: orderId,
        quantity,
        blocked_from: blockedFrom,
        blocked_until: blockedUntil,
    })
}


// ----------------------------------- GET CLIENT DASHBOARD SUMMARY ----------------------------
const getClientDashboardSummary = async (companyId: string, platformId: string) => {
    // Get today's date for upcoming events filter
    const today = new Date().toISOString().split('T')[0];

    // Base condition for all queries
    const baseCondition = and(
        eq(orders.company_id, companyId),
        eq(orders.platform_id, platformId),
        isNull(orders.deleted_at)
    );

    // Count active orders (in progress statuses)
    const activeOrderStatuses = [
        'CONFIRMED',
        'IN_PREPARATION',
        'READY_FOR_DELIVERY',
        'IN_TRANSIT',
        'DELIVERED',
        'IN_USE',
        'AWAITING_RETURN',
    ] as const;
    const activeOrders = await db
        .select()
        .from(orders)
        .where(
            and(baseCondition, inArray(orders.order_status, activeOrderStatuses))
        );

    // Count pending quotes
    const pendingQuotes = await db
        .select()
        .from(orders)
        .where(and(baseCondition, eq(orders.order_status, 'QUOTED')));

    // Count upcoming events (future events in pre-delivery statuses)
    const upcomingEventStatuses = ['CONFIRMED', 'IN_PREPARATION'] as const;
    const upcomingEvents = await db
        .select()
        .from(orders)
        .where(
            and(
                baseCondition,
                gte(orders.event_start_date, new Date(today)),
                inArray(orders.order_status, upcomingEventStatuses)
            )
        );

    // Count orders awaiting return
    const awaitingReturn = await db
        .select()
        .from(orders)
        .where(
            and(baseCondition, eq(orders.order_status, 'AWAITING_RETURN'))
        );

    // Get 5 most recent orders
    const recentOrders = await db
        .select({
            id: orders.id,
            order_id: orders.order_id,
            venue_name: orders.venue_name,
            event_start_date: orders.event_start_date,
            order_status: orders.order_status,
            brand: {
                id: brands.id,
                name: brands.name,
            },
            created_at: orders.created_at,
        })
        .from(orders)
        .leftJoin(brands, eq(orders.brand_id, brands.id))
        .where(baseCondition)
        .orderBy(desc(orders.created_at))
        .limit(5);

    return {
        summary: {
            active_orders: activeOrders.length,
            pending_quotes: pendingQuotes.length,
            upcoming_events: upcomingEvents.length,
            awaiting_return: awaitingReturn.length,
        },
        recent_orders: recentOrders.map(order => ({
            id: order.id,
            order_id: order.order_id,
            venue_name: order.venue_name,
            event_start_date: order.event_start_date,
            order_status: order.order_status,
            brand: order.brand,
            created_at: order.created_at,
        })),
    };
};

// ----------------------------------- ADJUST LOGISTICS PRICING -----------------------------------
const adjustLogisticsPricing = async (
    orderId: string,
    user: AuthUser,
    platformId: string,
    payload: AdjustLogisticsPricingPayload
) => {
    // Step 1: Fetch order and verify it exists
    const order = await db.query.orders.findFirst({
        where: and(
            eq(orders.id, orderId),
            eq(orders.platform_id, platformId)
        ),
        with: {
            company: true,
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, 'Order not found');
    }

    // Step 2: Verify order is in PRICING_REVIEW status
    if (order.order_status !== 'PRICING_REVIEW') {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            'Order is not in PRICING_REVIEW status'
        );
    }

    // Step 3: Get base price from logistics_pricing or calculate from tier
    const platformPricing = order.platform_pricing as any;
    const logisticsPricing = order.logistics_pricing as any;
    const basePrice = logisticsPricing?.base_price || null;

    // Step 4: Update logistics_pricing JSONB field
    const updatedLogisticsPricing = {
        base_price: basePrice,
        adjusted_price: payload.adjusted_price,
        adjustment_reason: payload.adjustment_reason,
        adjusted_at: new Date().toISOString(),
        adjusted_by: user.id,
    };

    // Step 5: Update order
    await db
        .update(orders)
        .set({
            logistics_pricing: updatedLogisticsPricing,
            platform_pricing: {
                ...platformPricing,
                margin_amount: Number(updatedLogisticsPricing.adjusted_price) * (Number(order.company.platform_margin_percent) / 100)
            },
            order_status: 'PENDING_APPROVAL',
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));

    // Step 6: Log status change in order_status_history
    await db
        .insert(orderStatusHistory)
        .values({
            platform_id: platformId,
            order_id: orderId,
            status: 'PENDING_APPROVAL',
            notes: `Logistics pricing adjusted: ${payload.adjustment_reason}`,
            updated_by: user.id,
        });

    // Step 7: Send notification to plaform admin
    const platformAdmins = await db
        .select({ email: users.email })
        .from(users)
        .where(
            and(eq(users.platform_id, platformId),
                eq(users.role, 'ADMIN'),
                sql`${users.permission_template} = 'PLATFORM_ADMIN' AND ${users.email} NOT LIKE '%@system.internal'`)
        )

    const platformAdminEmails = platformAdmins.map(admin => admin.email);

    // TODO: Change URL
    await multipleEmailSender(
        platformAdminEmails,
        `Action Required: Order ${order.order_id} - Logistics Pricing Adjustment`,
        emailTemplates.adjust_price({
            order_id: order.order_id,
            company_name: order.company.name,
            adjusted_price: updatedLogisticsPricing.adjusted_price,
            adjustment_reason: updatedLogisticsPricing.adjustment_reason,
            view_order_url: `http://localhost:3000/order/${order.order_id}`,
        })
    );

    return {
        id: order.id,
        order_id: order.order_id,
        order_status: 'PENDING_APPROVAL',
        base_price: updatedLogisticsPricing.base_price,
        adjusted_price: updatedLogisticsPricing.adjusted_price,
        adjustment_reason: updatedLogisticsPricing.adjustment_reason,
        adjusted_at: updatedLogisticsPricing.adjusted_at,
        adjusted_by: {
            id: updatedLogisticsPricing.adjusted_by,
            name: user.name,
        },
        company: {
            id: order.company.id,
            name: order.company.name,
        },
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
        .where(and(
            eq(orders.id, orderId),
            eq(orders.platform_id, platformId)
        ));

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Check company access (clients can only see own company)
    if (user.role === 'CLIENT') {
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
    platformId: string
) => {
    console.log(payload);
    // Step 1: Verify order exists
    const [order] = await db
        .select()
        .from(orders)
        .where(and(
            eq(orders.id, orderId),
            eq(orders.platform_id, platformId)
        ));

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Validate order status (immutable statuses)
    const immutableStatuses = ["IN_TRANSIT", "DELIVERED", "IN_USE", "AWAITING_RETURN", "CLOSED"];
    if (immutableStatuses.includes(order.order_status)) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Cannot update time windows after order is in transit");
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

    // Step 4: Send notification (Asynchronous)
    await NotificationLogServices.sendNotification(platformId, "TIME_WINDOWS_UPDATED", updatedOrder);

    return {
        id: updatedOrder.id,
        order_id: updatedOrder.order_id,
        delivery_window: updatedOrder.delivery_window,
        pickup_window: updatedOrder.pickup_window,
        updated_at: updatedOrder.updated_at,
    };
};

// ----------------------------------- GET PRICING REVIEW ORDERS ------------------------------
const getPricingReviewOrders = async (
    query: any,
    platformId: string
) => {
    const {
        search_term,
        page,
        limit,
        sort_by,
        sort_order,
        company_id,
        date_from,
        date_to,
    } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(orderQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(orderQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
        paginationMaker({
            page,
            limit,
            sort_by,
            sort_order,
        });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(orders.platform_id, platformId), eq(orders.order_status, "PRICING_REVIEW")];

    // Step 3b: Optional filters
    if (company_id) {
        conditions.push(eq(orders.company_id, company_id));
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
            }
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .where(and(...conditions))
        .orderBy(sortSequence === "asc" ? asc(sortField) : desc(sortField))
        .limit(limitNumber)
        .offset(skip);

    // Step 6: Get total count
    const [countResult] = await db
        .select({ count: count() })
        .from(orders)
        .where(and(...conditions));

    // Step 7: Enhance with standard pricing suggestion
    const enhancedResults = await Promise.all(results.map(async (result) => {
        const order = result.order;
        let standardPricing = null;

        // Try to find matching pricing tier
        let tierToUse = null;

        if (order.tier_id) {
            // Use assigned tier
            const [tier] = await db
                .select()
                .from(pricingTiers)
                .where(eq(pricingTiers.id, order.tier_id))
                .limit(1);
            tierToUse = tier;
        } else if (order.calculated_totals && order.venue_location) {
            // Try to find matching tier based on location and volume
            const calculatedTotals = order.calculated_totals as any;
            const venueLocation = order.venue_location as any;

            if (calculatedTotals.volume && venueLocation.country && venueLocation.city) {
                const volume = parseFloat(calculatedTotals.volume);

                const matchingTiers = await db
                    .select()
                    .from(pricingTiers)
                    .where(
                        and(
                            eq(pricingTiers.platform_id, platformId),
                            sql`LOWER(${pricingTiers.country}) = LOWER(${venueLocation.country})`,
                            sql`LOWER(${pricingTiers.city}) = LOWER(${venueLocation.city})`,
                            eq(pricingTiers.is_active, true),
                            lte(pricingTiers.volume_min, volume.toString()),
                            sql`(${pricingTiers.volume_max} IS NULL OR CAST(${pricingTiers.volume_max} AS DECIMAL) > ${volume})`
                        )
                    )
                    .limit(1);

                tierToUse = matchingTiers[0];
            }
        }

        if (tierToUse) {
            // Use flat rate from tier (NOT per-m³ multiplication)
            const basePrice = parseFloat(tierToUse.base_price);

            standardPricing = {
                basePrice,
                tierInfo: {
                    country: tierToUse.country,
                    city: tierToUse.city,
                    volume_range: `${tierToUse.volume_min}-${tierToUse.volume_max || '∞'} m³`,
                },
            };
        }

        return {
            id: order.id,
            order_id: order.order_id,
            company: {
                id: result.company?.id,
                name: result.company?.name,
            },
            contact_name: order.contact_name,
            event_start_date: order.event_start_date,
            venue_name: order.venue_name,
            venue_location: order.venue_location,
            calculated_volume: (order.calculated_totals as any)?.volume,
            calculated_weight: (order.calculated_totals as any)?.weight,
            status: order.order_status,
            createdAt: order.created_at,
            standard_pricing: standardPricing,
        };
    }));

    return {
        data: enhancedResults,
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: countResult.count,
        },
    };
};


// ----------------------------------- GET ORDER PRICING DETAILS ------------------------------
const getOrderPricingDetails = async (
    orderId: string,
    platformId: string
) => {
    // Step 1: Fetch order with relations
    const order = await db.query.orders.findFirst({
        where: and(
            eq(orders.id, orderId),
            eq(orders.platform_id, platformId)
        ),
        with: {
            company: true,
            pricing_tier: true,
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, 'Order not found');
    }

    // Step 2: Calculate standard pricing using helper function
    const standardPricing = await calculateStandardPricing(order);

    // Step 3: Return formatted pricing details
    return {
        order: {
            id: order.id,
            order_id: order.order_id,
            calculated_volume: (order.calculated_totals as any)?.volume || null,
            venue_location: order.venue_location,
            company: {
                id: order.company.id,
                name: order.company.name,
                platform_margin_percent: order.company.platform_margin_percent,
            },
        },
        pricing_tier: order.pricing_tier
            ? {
                id: order.pricing_tier.id,
                country: order.pricing_tier.country,
                city: order.pricing_tier.city,
                volume_min: order.pricing_tier.volume_min,
                volume_max: order.pricing_tier.volume_max,
                base_price: order.pricing_tier.base_price,
            }
            : null,
        standard_pricing: standardPricing,
        current_pricing: {
            logistics_pricing: order.logistics_pricing || null,
            platform_pricing: order.platform_pricing || null,
            final_pricing: order.final_pricing || null
        },
    };
};

// ----------------------------------- HELPER: CALCULATE STANDARD PRICING ---------------------
const calculateStandardPricing = async (order: any): Promise<StandardPricing> => {
    const calculatedTotals = order.calculated_totals as any;
    const venueLocation = order.venue_location as any;
    const volume = parseFloat(calculatedTotals?.volume || '0');
    const venueCity = venueLocation?.city;
    const venueCountry = venueLocation?.country;

    if (!venueCity || !venueCountry) {
        return {
            pricing_tier_id: null,
            logistics_base_price: null,
            platform_margin_percent: parseFloat(order.company.platform_margin_percent),
            platform_margin_amount: null,
            final_total_price: null,
            tier_found: false,
        };
    }

    // Find matching pricing tier (case-insensitive city match)
    const tier = await db.query.pricingTiers.findFirst({
        where: and(
            eq(pricingTiers.platform_id, order.platform_id),
            eq(sql`LOWER(${pricingTiers.country})`, venueCountry.toLowerCase()),
            eq(sql`LOWER(${pricingTiers.city})`, venueCity.toLowerCase()),
            lte(pricingTiers.volume_min, volume.toString()),
            or(
                isNull(pricingTiers.volume_max),
                gte(pricingTiers.volume_max, volume.toString())
            ),
            eq(pricingTiers.is_active, true)
        ),
    });

    if (!tier) {
        // Try wildcard city match
        const wildcardTier = await db.query.pricingTiers.findFirst({
            where: and(
                eq(pricingTiers.platform_id, order.platform_id),
                eq(sql`LOWER(${pricingTiers.country})`, venueCountry.toLowerCase()),
                eq(pricingTiers.city, '*'),
                lte(pricingTiers.volume_min, volume.toString()),
                or(
                    isNull(pricingTiers.volume_max),
                    gte(pricingTiers.volume_max, volume.toString())
                ),
                eq(pricingTiers.is_active, true)
            ),
        });

        if (!wildcardTier) {
            return {
                pricing_tier_id: null,
                logistics_base_price: null,
                platform_margin_percent: parseFloat(order.company.platform_margin_percent),
                platform_margin_amount: null,
                final_total_price: null,
                tier_found: false,
            };
        }

        // Use wildcard tier
        const logisticsBasePrice = parseFloat(wildcardTier.base_price);
        const platformMarginPercent = parseFloat(order.company.platform_margin_percent);
        const platformMarginAmount = logisticsBasePrice * (platformMarginPercent / 100);
        const finalTotalPrice = logisticsBasePrice + platformMarginAmount;

        return {
            pricing_tier_id: wildcardTier.id,
            logistics_base_price: parseFloat(logisticsBasePrice.toFixed(2)),
            platform_margin_percent: parseFloat(platformMarginPercent.toFixed(2)),
            platform_margin_amount: parseFloat(platformMarginAmount.toFixed(2)),
            final_total_price: parseFloat(finalTotalPrice.toFixed(2)),
            tier_found: true,
        };
    }

    // Calculate standard pricing
    const logisticsBasePrice = parseFloat(tier.base_price);
    const platformMarginPercent = parseFloat(order.company.platform_margin_percent);
    const platformMarginAmount = logisticsBasePrice * (platformMarginPercent / 100);
    const finalTotalPrice = logisticsBasePrice + platformMarginAmount;

    return {
        pricing_tier_id: tier.id,
        logistics_base_price: parseFloat(logisticsBasePrice.toFixed(2)),
        platform_margin_percent: parseFloat(platformMarginPercent.toFixed(2)),
        platform_margin_amount: parseFloat(platformMarginAmount.toFixed(2)),
        final_total_price: parseFloat(finalTotalPrice.toFixed(2)),
        tier_found: true,
    };
};


// ----------------------------------- APPROVE STANDARD PRICING -----------------------------------
const approveStandardPricing = async (
    orderId: string,
    user: AuthUser,
    platformId: string,
    payload: ApproveStandardPricingPayload
) => {
    // Step 1: Fetch order with company details
    const order = await db.query.orders.findFirst({
        where: and(
            eq(orders.id, orderId),
            eq(orders.platform_id, platformId)
        ),
        with: {
            company: true,
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, 'Order not found');
    }

    // Step 2: Verify order is in PRICING_REVIEW status
    if (order.order_status !== 'PRICING_REVIEW') {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order is not in PRICING_REVIEW status. Current status: ${order.order_status}`
        );
    }

    // Step 3: Calculate standard pricing
    const standardPricing = await calculateStandardPricing(order);

    // Step 4: Verify pricing tier was found
    if (!standardPricing.tier_found) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            'No pricing tier found for this order. Please adjust pricing manually.'
        );
    }

    // Step 5: Prepare pricing objects
    const logisticsPricing = {
        base_price: standardPricing.logistics_base_price,
    };

    const platformPricing = {
        margin_percent: standardPricing.platform_margin_percent,
        margin_amount: standardPricing.platform_margin_amount,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        notes: payload.notes || null,
    };

    const finalPricing = {
        total_price: standardPricing.final_total_price,
        quote_sent_at: new Date().toISOString(),
    };

    // Step 6: Update order with standard pricing
    await db
        .update(orders)
        .set({
            tier_id: standardPricing.pricing_tier_id,
            logistics_pricing: logisticsPricing,
            platform_pricing: platformPricing,
            final_pricing: finalPricing,
            order_status: 'QUOTED',
            financial_status: 'QUOTE_SENT',
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));

    // Step 7: Log status change in order_status_history
    await db
        .insert(orderStatusHistory)
        .values({
            platform_id: platformId,
            order_id: orderId,
            status: 'QUOTED',
            notes: payload.notes || 'Standard pricing approved',
            updated_by: user.id,
        });

    // TODO: Send email

    // Step 8: Return pricing details
    return {
        id: order.id,
        order_id: order.order_id,
        order_status: 'QUOTED',
        financial_status: 'QUOTE_SENT',
        pricing: {
            logistics_base_price: standardPricing.logistics_base_price,
            platform_margin_percent: standardPricing.platform_margin_percent,
            platform_margin_amount: standardPricing.platform_margin_amount,
            final_total_price: standardPricing.final_total_price,
        },
        tier_id: standardPricing.pricing_tier_id,
        quote_sent_at: finalPricing.quote_sent_at,
    };
};


// ----------------------------------- APPROVE PLATFORM PRICING -----------------------------------
const approvePlatformPricing = async (
    orderId: string,
    user: AuthUser,
    platformId: string,
    payload: ApprovePlatformPricingPayload
) => {
    const { logistics_base_price, platform_margin_percent, notes } = payload;
    // Step 1: Fetch order with company details
    const order = await db.query.orders.findFirst({
        where: and(
            eq(orders.id, orderId),
            eq(orders.platform_id, platformId)
        ),
        with: {
            company: true,
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, 'Order not found');
    }

    // Step 2: Verify order is in PENDING_APPROVAL status
    if (order.order_status !== 'PENDING_APPROVAL') {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order is not in PENDING_APPROVAL status. Current status: ${order.order_status}`
        );
    }

    // Step 4: Calculate platform margin and final pricing
    const platformMarginAmount = logistics_base_price * (platform_margin_percent / 100);
    const finalTotalPrice = logistics_base_price + platformMarginAmount;

    // Step 5: Update platform_pricing with review details
    const platformPricing = {
        margin_percent: platform_margin_percent,
        margin_amount: parseFloat(platformMarginAmount.toFixed(2)),
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        notes: notes || null,
    };

    // Step 6: Update final_pricing
    const finalPricing = {
        total_price: parseFloat(finalTotalPrice.toFixed(2)),
        quote_sent_at: new Date().toISOString(),
    };

    // Step 7: Update order with platform approval
    await db
        .update(orders)
        .set({
            platform_pricing: platformPricing,
            final_pricing: finalPricing,
            order_status: 'QUOTED',
            financial_status: 'QUOTE_SENT',
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));

    // Step 8: Log status change in order_status_history
    await db
        .insert(orderStatusHistory)
        .values({
            platform_id: platformId,
            order_id: orderId,
            status: 'QUOTED',
            notes: notes || 'Platform approved adjusted pricing',
            updated_by: user.id,
        });

    // TODO: Send quote notification email

    // Step 9: Return approval details
    return {
        id: order.id,
        order_id: order.order_id,
        order_status: 'QUOTED',
        financial_status: 'QUOTE_SENT',
        pricing: {
            logistics_adjusted_price: logistics_base_price,
            platform_margin_percent: platform_margin_percent,
            platform_margin_amount: parseFloat(platformMarginAmount.toFixed(2)),
            final_total_price: parseFloat(finalTotalPrice.toFixed(2)),
        },
        reviewed_at: platformPricing.reviewed_at,
        reviewed_by: {
            id: user.id,
            name: user.name,
        },
        review_notes: notes || null,
        quote_sent_at: finalPricing.quote_sent_at,
    };
};


export const OrderServices = {
    submitOrderFromCart,
    getOrders,
    getMyOrders,
    getOrderById,
    updateJobNumber,
    getOrderScanEvents,
    progressOrderStatus,
    getClientDashboardSummary,
    getOrderStatusHistory,
    updateOrderTimeWindows,
    getPricingReviewOrders,
    getOrderPricingDetails,
    adjustLogisticsPricing,
    approveStandardPricing,
    approvePlatformPricing,
};

