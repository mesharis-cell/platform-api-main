import dayjs from "dayjs";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    assets,
    brands,
    collections,
    companies,
    orderItems,
    orders,
    pricingTiers,
    users
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { sendEmail } from "../../services/email.service";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { OrderItem, OrderSubmittedEmailData, SubmitOrderPayload } from "./order.interfaces";
import { orderQueryValidationConfig, orderSortableFields } from "./order.utils";

// Import asset availability checker
import { checkMultipleAssetsAvailability } from "../asset/assets.services";
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
        })
        .returning();

    // Step 8: Insert order items with snapshot data
    const itemsToInsert = orderItemsData.map((item) => ({
        ...item,
        order_id: order.id
    }));

    await db.insert(orderItems).values(itemsToInsert);

    // Step 9: Prepare email notification data
    const [company] = await db.select().from(companies).where(eq(companies.id, companyId));

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
    await sendOrderSubmittedNotifications(emailData);

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

// ----------------------------------- GET ORDERS -----------------------------------------
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
            total_pages: Math.ceil(countResult.count / limitNumber),
        },
    };
};

export const OrderServices = {
    submitOrderFromCart,
    getOrders,
};
