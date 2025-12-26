import dayjs from "dayjs";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    assets,
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
import { OrderItem, OrderSubmittedEmailData, SubmitOrderPayload } from "./order.interfaces";

// Import asset availability checker
import { checkMultipleAssetsAvailability } from "../asset/assets.services";
import { orderIdGenerator, renderOrderSubmittedEmail } from "./order.utils";

// Promise < {
//     orderId: string;
//     status: string;
//     companyName: string;
//     calculatedVolume: string;
//     itemCount: number;
// }

// ----------------------------------- SUBMIT ORDER FROM CART ---------------------------------
const submitOrderFromCart = async (
    user: AuthUser,
    companyId: string,
    platformId: string,
    payload: SubmitOrderPayload
): Promise<null> => {
    const { items, brand_id, event_start_date, event_end_date, venue_name, venue_country, venue_city, venue_address, contact_name, contact_email, contact_phone, venue_access_notes, special_instructions } = payload;

    // Step 2: Validate dates first (needed for availability check)
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

    // Step 3: Validate all assets belong to company and are available
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

    // Step 4: Validate all assets are AVAILABLE (status check)
    const unavailableAssets = foundAssets.filter((a) => a.status !== "AVAILABLE");
    if (unavailableAssets.length > 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot order unavailable assets: ${unavailableAssets.map((a) => a.name).join(", ")}`
        );
    }

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

    // Step 8: Create order items data with totals
    const orderItemsData = [];
    let totalVolume = 0;
    let totalWeight = 0;

    for (const item of items) {
        const asset = foundAssets.find((a) => a.id === item.asset_id)!;
        const itemVolume = parseFloat(asset.volume_per_unit) * item.quantity;
        const itemWeight = parseFloat(asset.weight_per_unit) * item.quantity;

        totalVolume += itemVolume;
        totalWeight += itemWeight;

        // Get collection name if from collection
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

    // Step 9: Find matching pricing tier
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

    // Step 10: Create order directly as PRICING_REVIEW (A2 staff reviews immediately)
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

    // Step 11: Add order items
    const itemsToInsert = orderItemsData.map((item) => ({
        ...item,
        order_id: order.id
    }));

    await db.insert(orderItems).values(itemsToInsert);

    // Step 13: Get company name for response
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

    await sendOrderSubmittedNotifications(emailData);
    await sendOrderSubmittedConfirmationToClient(
        contact_email,
        contact_name,
        emailData
    );

    // return {
    //     orderId: order.order_id,
    //     status: "PRICING_REVIEW",
    //     companyName: company?.name || "",
    //     calculatedVolume,
    //     itemCount: items.length,
    // };

    return null;
};

// ----------------------------------- SEND ORDER SUBMITTED NOTIFICATIONS ---------------------
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

// ----------------------------------- SEND ORDER CONFIRMATION TO CLIENT ----------------------
const sendOrderSubmittedConfirmationToClient = async (
    clientEmail: string,
    clientName: string,
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

export const OrderServices = {
    submitOrderFromCart,
};
