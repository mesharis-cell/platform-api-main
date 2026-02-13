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
    lineItems,
    prices,
    orders,
    orderStatusHistory,
    reskinRequests,
    scanEvents,
    users,
    vehicleTypes,
    countries,
    orderItems,
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
    AdminApproveQuotePayload,
    UpdateVehiclePayload,
    UpdateTripTypePayload,
    TruckDetailsPayload,
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
import { shouldAwaitFabrication } from "./order-pricing.helpers";
import { LineItemsServices } from "../order-line-items/order-line-items.services";
import { ReskinRequestsServices } from "../reskin-requests/reskin-requests.services";
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
import { costEstimateGenerator } from "../../utils/cost-estimate";
import { calculatePricingSummary } from "../../utils/pricing-engine";
import { GoodsFormType, generateGoodsFormXlsx } from "../../utils/goods-form-xlsx";

// ----------------------------------- CALCULATE ESTIMATE -------------------------------------
const calculateEstimate = async (
    platformId: string,
    companyId: string,
    payload: CalculateEstimatePayload
) => {
    // Step 1: Extract payload data
    const { items, venue_city, trip_type } = payload;

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

    console.log("total volume: ", totalVolume);

    // Step 5: Determine margin and check for rebrand items
    const marginPercent = parseFloat(company.platform_margin_percent);
    const hasRebrandItems = items.some((item) => item.is_reskin_request);

    // Find the suitable vehicle type
    // Find the suitable vehicle type
    // We want the smallest vehicle that fits the volume (vehicle_size >= totalVolume)
    let selectedVehicleType = (
        await db
            .select()
            .from(vehicleTypes)
            .where(
                and(
                    eq(vehicleTypes.platform_id, platformId),
                    eq(vehicleTypes.is_active, true),
                    gte(vehicleTypes.vehicle_size, totalVolume.toString())
                )
            )
            .orderBy(asc(vehicleTypes.vehicle_size))
            .limit(1)
    )[0];

    if (!selectedVehicleType) {
        // Fallback to default vehicle
        const defaultVehicle = await db.query.vehicleTypes.findFirst({
            where: and(eq(vehicleTypes.is_default, true), eq(vehicleTypes.platform_id, platformId)),
        });

        if (defaultVehicle) {
            selectedVehicleType = defaultVehicle;
        } else {
            // Fallback to check if it's a capacity issue or configuration issue
            const [largestVehicle] = await db
                .select()
                .from(vehicleTypes)
                .where(
                    and(eq(vehicleTypes.platform_id, platformId), eq(vehicleTypes.is_active, true))
                )
                .orderBy(desc(vehicleTypes.vehicle_size))
                .limit(1);

            if (!largestVehicle) {
                throw new CustomizedError(
                    httpStatus.NOT_FOUND,
                    "No vehicle types configuration found"
                );
            }

            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Total volume (${totalVolume} m3) exceeds the capacity of the largest available vehicle (${largestVehicle.vehicle_size} m3)`
            );
        }
    }

    // Step 6: Lookup transport rate based on venue and trip type
    const transportRateInfo = await TransportRatesServices.lookupTransportRate(
        platformId,
        companyId,
        venue_city,
        trip_type,
        selectedVehicleType.id
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
            trip_type: trip_type,
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
        trip_type,
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
        special_instructions,
    } = payload;

    const tripType = trip_type || "ROUND_TRIP";
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

    // Step 5: Determine the most suitable vehicle type
    const volume = parseFloat(calculatedVolume);

    // Find the suitable vehicles that fits the volume (vehicle_size >= totalVolume)
    let vehicleType = (
        await db
            .select()
            .from(vehicleTypes)
            .where(
                and(
                    eq(vehicleTypes.platform_id, platformId),
                    eq(vehicleTypes.is_active, true),
                    gte(vehicleTypes.vehicle_size, volume.toString())
                )
            )
            .orderBy(asc(vehicleTypes.vehicle_size))
            .limit(1)
    )[0];

    if (!vehicleType) {
        // Fallback to default vehicle
        const defaultVehicle = await db.query.vehicleTypes.findFirst({
            where: and(eq(vehicleTypes.is_default, true), eq(vehicleTypes.platform_id, platformId)),
        });

        if (defaultVehicle) {
            vehicleType = defaultVehicle;
        } else {
            // Fallback to check if it's a capacity issue or configuration issue
            const [largestVehicle] = await db
                .select()
                .from(vehicleTypes)
                .where(
                    and(eq(vehicleTypes.platform_id, platformId), eq(vehicleTypes.is_active, true))
                )
                .orderBy(desc(vehicleTypes.vehicle_size))
                .limit(1);

            if (!largestVehicle) {
                throw new CustomizedError(
                    httpStatus.NOT_FOUND,
                    "No vehicle types configuration found"
                );
            }

            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Total volume (${volume} m3) exceeds the capacity of the largest available vehicle`
            );
        }
    }

    const transportRateInfo = await TransportRatesServices.lookupTransportRate(
        platformId,
        companyId,
        venue_city_id,
        tripType,
        vehicleType.id
    );

    const transportRate = transportRateInfo?.rate ? Number(transportRateInfo.rate) : null;
    const baseOpsTotal = Number(company.warehouse_ops_rate) * volume;
    const logisticsSubTotal = transportRate ? transportRate + baseOpsTotal : null;
    const marginAmount = logisticsSubTotal
        ? logisticsSubTotal * (Number(company.platform_margin_percent) / 100)
        : null;
    const finalTotal = logisticsSubTotal && marginAmount ? logisticsSubTotal + marginAmount : null;

    const pricingDetails = {
        platform_id: platformId,
        warehouse_ops_rate: company.warehouse_ops_rate,
        base_ops_total: baseOpsTotal.toFixed(2),
        logistics_sub_total: logisticsSubTotal ? logisticsSubTotal.toFixed(2) : null,
        transport: {
            system_rate: transportRate,
            final_rate: transportRate,
        },
        line_items: {
            catalog_total: 0,
            custom_total: 0,
        },
        margin: {
            percent: company.platform_margin_percent,
            amount: marginAmount,
            is_override: false,
            override_reason: null,
        },
        final_total: finalTotal ? finalTotal.toFixed(2) : null,
        calculated_at: new Date(),
        calculated_by: user.id,
    };

    // Step 6: Create the order record
    const orderId = await orderIdGenerator(platformId);
    const orderResult = await db.transaction(async (tx) => {
        // Step 6.a: Insert order pricing
        const [orderPricing] = await tx.insert(prices).values(pricingDetails).returning();

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
                    country: country.name,
                    address: venue_address,
                    access_notes: venue_access_notes || null,
                },
                special_instructions: special_instructions || null,
                calculated_totals: {
                    volume: calculatedVolume,
                    weight: calculatedWeight,
                },
                trip_type: tripType,
                vehicle_type_id: vehicleType.id,
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
        venue_city: city.name,
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
                name: cities.name,
            },
            order_pricing: {
                warehouse_ops_rate: prices.warehouse_ops_rate,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                transport: prices.transport,
                line_items: prices.line_items,
                margin: prices.margin,
                final_total: prices.final_total,
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
                name: cities.name,
            },
            order_pricing: {
                warehouse_ops_rate: prices.warehouse_ops_rate,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                transport: prices.transport,
                line_items: prices.line_items,
                margin: prices.margin,
                final_total: prices.final_total,
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
                name: cities.name,
            },
            order_pricing: {
                warehouse_ops_rate: prices.warehouse_ops_rate,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                transport: prices.transport,
                line_items: prices.line_items,
                margin: prices.margin,
                final_total: prices.final_total,
                calculated_at: prices.calculated_at,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(brands, eq(orders.brand_id, brands.id))
        .leftJoin(users, eq(orders.user_id, users.id))
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
                is_reskin_request: orderItems.is_reskin_request,
                reskin_target_brand_id: brands.id,
                reskin_target_brand_name: brands.name,
                reskin_target_brand_custom: orderItems.reskin_target_brand_custom,
                reskin_notes: orderItems.reskin_notes,
            },
            asset: {
                id: assets.id,
                name: assets.name,
                status: assets.status,
                condition: assets.condition,
                condition_notes: assets.condition_notes,
                refurbishment_days_estimate: assets.refurb_days_estimate,
                images: assets.images,
            },
            collection: {
                id: collections.id,
                name: collections.name,
            },
        })
        .from(orderItems)
        .leftJoin(assets, eq(orderItems.asset_id, assets.id))
        .leftJoin(collections, eq(orderItems.from_collection, collections.id))
        .leftJoin(brands, eq(orderItems.reskin_target_brand_id, brands.id))
        .where(eq(orderItems.order_id, orderData.order.id));

    const [lineItems, reskinRequests] = await Promise.all([
        LineItemsServices.getLineItems(platformId, { order_id: orderData.order.id }),
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
            AWAITING_FABRICATION: "Custom Work In Progress",
            IN_PREPARATION: "Preparing Items",
            READY_FOR_DELIVERY: "Ready for Delivery",
            IN_TRANSIT: "In Transit",
            DELIVERED: "Delivered",
            AWAITING_RETURN: "Awaiting Pickup",
            RETURN_IN_TRANSIT: "Return In Transit",
            CLOSED: "Complete",
            CANCELLED: "Cancelled",
        };

        return {
            ...orderData.order,
            company: orderData.company,
            brand: orderData.brand,
            user: orderData.user,
            items: itemResults,
            line_items: lineItems,
            reskin_requests: reskinRequests,
            order_status_history: orderHistory.map((h) => ({
                ...h,
                status_label: CLIENT_SAFE_LABELS[h.status] || h.status,
                notes: null,
            })),
            venue_city: orderData.venue_city?.name || null,
            order_pricing: orderData.order_pricing,
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
        reskin_requests: reskinRequests,
        financial_status_history: financialHistory,
        order_status_history: orderHistory,
        venue_city: orderData.venue_city?.name || null,
        order_pricing: orderData.order_pricing,
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

    if (currentStatus === "AWAITING_FABRICATION" || currentStatus === "CONFIRMED") {
        // fetch all assets item and check if all assets condition is GREEN
        const assetsList = await db
            .select()
            .from(orderItems)
            .innerJoin(assets, eq(orderItems.asset_id, assets.id))
            .where(eq(orderItems.order_id, order.id));

        // check if all assets condition is GREEN
        const allAssetsConditionGreen = assetsList.every(
            (asset) => asset.assets.condition === "GREEN"
        );

        if (!allAssetsConditionGreen) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "All assets condition must be GREEN before transitioning to AWAITING_FABRICATION or CONFIRMED"
            );
        }

        // Fetch all reskin request and check if all rekin request is completed
        const requests = await db.query.reskinRequests.findMany({
            where: and(
                eq(reskinRequests.order_id, orderId),
                eq(reskinRequests.platform_id, platformId)
            ),
            with: {
                order_item: true,
                original_asset: true,
                target_brand: true,
                new_asset: true,
            },
        });

        // Check if all reskin requests are completed
        const allReskinRequestsCompleted = requests.every(
            (request) => request.completed_at !== null
        );

        if (!allReskinRequestsCompleted) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "All reskin requests must be completed before transitioning to AWAITING_FABRICATION or CONFIRMED"
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

    // Step 4: Filter for CLIENT role — strip internal details
    if (user.role === "CLIENT") {
        const CLIENT_SAFE_LABELS: Record<string, string> = {
            DRAFT: "Order Created",
            PRICING_REVIEW: "Order Received",
            PENDING_APPROVAL: "Order Under Review",
            QUOTED: "Quote Ready",
            DECLINED: "Quote Declined",
            CONFIRMED: "Order Confirmed",
            AWAITING_FABRICATION: "Custom Work In Progress",
            IN_PREPARATION: "Preparing Items",
            READY_FOR_DELIVERY: "Ready for Delivery",
            IN_TRANSIT: "In Transit",
            DELIVERED: "Delivered",
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

// ----------------------------------- APPROVE QUOTE ------------------------------------------
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

    await db.transaction(async (tx) => {
        // Update order status based on reskins
        await tx
            .update(orders)
            .set({
                order_status: nextStatus,
                financial_status: "QUOTE_ACCEPTED",
                updated_at: new Date(),
            })
            .where(eq(orders.id, orderId));

        // Log status change
        await tx.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: nextStatus,
            notes: hasPendingReskins
                ? "Client approved quote. Order awaiting fabrication completion."
                : notes || "Client approved quote",
            updated_by: user.id,
        });
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

// ----------------------------------- SEND INVOICE -------------------------------------------
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

    // Step 5: Update order financial status to INVOICED and log the status change
    await db.transaction(async (tx) => {
        await db
            .update(orders)
            .set({
                financial_status: "INVOICED",
                updated_at: new Date(),
            })
            .where(eq(orders.id, orderId));

        await db.insert(financialStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "INVOICED",
            notes: `Order invoiced by ${user.name}`,
            updated_by: user.id,
        });
    });

    // Step 6: Return updated order details
    return {
        id: order.id,
        order_id: order.order_id,
        financial_status: "INVOICED",
        updated_at: new Date(),
    };
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
                warehouse_ops_rate: prices.warehouse_ops_rate,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                transport: prices.transport,
                line_items: prices.line_items,
                margin: prices.margin,
                final_total: prices.final_total,
                calculated_at: prices.calculated_at,
            },
            venue_city: {
                name: cities.name,
            },
            vehicle_type: {
                name: vehicleTypes.name,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .leftJoin(cities, eq(orders.venue_city_id, cities.id))
        .leftJoin(vehicleTypes, eq(orders.vehicle_type_id, vehicleTypes.id))
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)))
        .limit(1);

    const order = result.order;
    const company = result.company;
    const orderPricing = result.order_pricing;
    const venueCity = result.venue_city;
    const vehicleType = result.vehicle_type;

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }
    if (!company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found for this order");
    }
    if (!orderPricing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order pricing not found for this order");
    }
    if (!venueCity) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Venue city not found for this order");
    }
    if (!vehicleType) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Vehicle type not found for this order");
    }

    // Step 2: Verify order is in PRICING_REVIEW status
    if (order.order_status !== "PRICING_REVIEW") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order is not in PRICING_REVIEW status. Current status: ${order.order_status}`
        );
    }

    // Step 3: Get transport rate info
    const transportRateInfo = await TransportRatesServices.lookupTransportRate(
        platformId,
        company.id,
        order.venue_city_id,
        order.trip_type,
        order.vehicle_type_id
    );

    if (!transportRateInfo) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            `Transport rate not found for ${venueCity.name} to ${order.trip_type} by ${vehicleType.name}`
        );
    }

    // Step 4: Get line items totals
    const lineItemsTotals = await LineItemsServices.calculateOrderLineItemsTotals(
        orderId,
        platformId
    );

    // Step 5: Calculate final pricing
    const transportRate = Number(transportRateInfo.rate);
    const volume = parseFloat((order.calculated_totals as any).volume);
    const marginOverride = !!(orderPricing?.margin as any)?.is_override;
    const marginPercent = marginOverride
        ? parseFloat((orderPricing.margin as any).percent)
        : parseFloat(company.platform_margin_percent);
    const marginOverrideReason = marginOverride
        ? (orderPricing.margin as any).override_reason
        : null;
    const baseOpsTotal = volume * Number(company.warehouse_ops_rate);
    const pricingSummary = calculatePricingSummary({
        base_ops_total: baseOpsTotal,
        transport_rate: transportRate,
        catalog_total: lineItemsTotals.catalog_total,
        custom_total: lineItemsTotals.custom_total,
        margin_percent: marginPercent,
    });

    const newPricing = {
        base_ops_total: baseOpsTotal.toFixed(2),
        logistics_sub_total: pricingSummary.logistics_sub_total.toFixed(2),
        transport: {
            system_rate: transportRate,
            final_rate: transportRate,
        },
        line_items: {
            catalog_total: lineItemsTotals.catalog_total,
            custom_total: lineItemsTotals.custom_total,
        },
        margin: {
            percent: marginPercent,
            amount: pricingSummary.margin_amount,
            is_override: marginOverride,
            override_reason: marginOverrideReason,
        },
        final_total: pricingSummary.final_total.toFixed(2),
        calculated_at: new Date(),
        calculated_by: user.id,
    };

    // Step 6: Update order pricing and status
    await db.transaction(async (tx) => {
        // Step 6.1: Update order pricing
        await tx.update(prices).set(newPricing).where(eq(prices.id, order.order_pricing_id));

        // Step 6.2: Update order status
        await tx
            .update(orders)
            .set({
                order_status: "PENDING_APPROVAL",
                updated_at: new Date(),
            })
            .where(eq(orders.id, orderId));

        // Step 6.3: Log status change
        await db.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "PENDING_APPROVAL",
            notes: "Logistics submitted for Admin approval",
            updated_by: user.id,
        });
    });

    // Step 7: Send notification
    await NotificationLogServices.sendNotification(platformId, "A2_ADJUSTED_PRICING", {
        ...order,
        company,
    });

    // Step 8: Return updated order
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
                warehouse_ops_rate: prices.warehouse_ops_rate,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                transport: prices.transport,
                line_items: prices.line_items,
                margin: prices.margin,
                final_total: prices.final_total,
                calculated_at: prices.calculated_at,
            },
            venue_city: {
                name: cities.name,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .leftJoin(cities, eq(orders.venue_city_id, cities.id))
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)))
        .limit(1);

    const order = result.order;
    const company = result.company;
    const orderPricing = result.order_pricing;
    const venueCity = result.venue_city;

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
    if (!venueCity) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Venue city not found for this order");
    }

    if (order.order_status !== "PENDING_APPROVAL") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order is not in PENDING_APPROVAL status. Current status: ${order.order_status}`
        );
    }

    const unprocessedReskins = await db
        .select({ id: orderItems.id })
        .from(orderItems)
        .leftJoin(reskinRequests, eq(reskinRequests.order_item_id, orderItems.id))
        .where(
            and(
                eq(orderItems.order_id, orderId),
                eq(orderItems.is_reskin_request, true),
                isNull(reskinRequests.id)
            )
        );

    if (unprocessedReskins.length > 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "All rebrand requests must be processed before approving the quote"
        );
    }

    // Determine if this is a revised quote (order was previously quoted)
    const isRevisedQuote = ["QUOTE_SENT", "QUOTE_REVISED"].includes(order.financial_status);
    const newFinancialStatus = isRevisedQuote ? "QUOTE_REVISED" : "QUOTE_SENT";

    let finalTotal = orderPricing.final_total;

    // Step 3: Update order pricing and status
    await db.transaction(async (tx) => {
        // Step 3.1: Update pricing if margin override is provided
        if (margin_override_percent) {
            const baseOpsTotal = Number(orderPricing.base_ops_total);
            const transportRate = Number((orderPricing.transport as any).final_rate || 0);
            const catalogTotal = Number((orderPricing.line_items as any).catalog_total || 0);
            const customTotal = Number((orderPricing.line_items as any).custom_total || 0);
            const pricingSummary = calculatePricingSummary({
                base_ops_total: baseOpsTotal,
                transport_rate: transportRate,
                catalog_total: catalogTotal,
                custom_total: customTotal,
                margin_percent: margin_override_percent,
            });

            finalTotal = pricingSummary.final_total.toFixed(2);

            await tx
                .update(prices)
                .set({
                    logistics_sub_total: pricingSummary.logistics_sub_total.toFixed(2),
                    margin: {
                        percent: margin_override_percent,
                        amount: pricingSummary.margin_amount,
                        is_override: true,
                        override_reason: margin_override_reason,
                    },
                    final_total: pricingSummary.final_total.toFixed(2),
                    calculated_at: new Date(),
                    calculated_by: user.id,
                })
                .where(eq(prices.id, order.order_pricing_id));
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
        await db.insert(financialStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: newFinancialStatus,
            notes: isRevisedQuote ? "Revised quote sent to client" : "Quote sent to client",
            updated_by: user.id,
        });
    });

    // Generate/update cost estimate PDF after approval.
    await costEstimateGenerator(orderId, platformId, user, true);

    // Step 4: Send notification
    await NotificationLogServices.sendNotification(platformId, "QUOTE_SENT", {
        ...order,
        company,
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
                .update(lineItems)
                .set({
                    is_voided: true,
                    voided_at: new Date(),
                    voided_by: user.id,
                    void_reason: "Order cancelled",
                })
                .where(eq(lineItems.reskin_request_id, reskin.id));
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

// ----------------------------------- UPDATE ORDER VEHICLE ----------------------------------
const updateOrderVehicle = async (
    orderId: string,
    platformId: string,
    user: AuthUser,
    payload: UpdateVehiclePayload
) => {
    // Step 1: Extract payload data
    const { vehicle_type_id, reason } = payload;

    // Step 2: Fetch order from database
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 3: Verify order is in valid status for vehicle update
    if (!["PRICING_REVIEW", "PENDING_APPROVAL"].includes(order.order_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Vehicle type can only be changed during pricing review"
        );
    }

    // Step 4: Fetch order pricing details
    const orderPricing = await db.query.prices.findFirst({
        where: and(eq(prices.id, order.order_pricing_id), eq(orders.platform_id, platformId)),
    });

    if (!orderPricing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order pricing not found");
    }

    // Step 5: Fetch vehicle type details
    const vehicleType = await db.query.vehicleTypes.findFirst({
        where: eq(vehicleTypes.id, vehicle_type_id),
    });

    if (!vehicleType) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Vehicle type not found");
    }

    // Step 6: Lookup new transport rate for the updated vehicle type
    const transportRateInfo = await TransportRatesServices.lookupTransportRate(
        platformId,
        order.company_id,
        order.venue_city_id,
        order.trip_type,
        vehicle_type_id
    );

    // Step 7: Calculate updated pricing with new transport rate
    const transportRate = transportRateInfo?.rate ? Number(transportRateInfo.rate) : null;
    const baseOpsTotal = Number(orderPricing.base_ops_total);
    const catalogTotal = Number((orderPricing.line_items as any)?.catalog_total || 0);
    const customTotal = Number((orderPricing.line_items as any)?.custom_total || 0);
    const marginPercent = Number((orderPricing.margin as any).percent);
    const pricingSummary = calculatePricingSummary({
        base_ops_total: baseOpsTotal,
        transport_rate: transportRate || 0,
        catalog_total: catalogTotal,
        custom_total: customTotal,
        margin_percent: marginPercent,
    });

    // Step 8: Prepare updated pricing object
    const updatedPricing = {
        logistics_sub_total: pricingSummary.logistics_sub_total.toFixed(2),
        transport: {
            system_rate: (orderPricing.transport as any).system_rate,
            final_rate: transportRate,
        },
        margin: {
            ...(orderPricing.margin as Record<string, any>),
            amount: pricingSummary.margin_amount,
        },
        final_total: pricingSummary.final_total.toFixed(2),
        calculated_at: new Date(),
        calculated_by: user.id,
    };

    // Step 9: Update order pricing and vehicle type in transaction
    await db.transaction(async (tx) => {
        // Step 9.1: Update order pricing with new transport rate
        await tx.update(prices).set(updatedPricing).where(eq(prices.id, order.order_pricing_id));

        // Step 9.2: Update order vehicle type
        await tx
            .update(orders)
            .set({
                vehicle_type_id,
                updated_at: new Date(),
            })
            .where(eq(orders.id, orderId));
    });

    if (order.order_status !== "PRICING_REVIEW") {
        await costEstimateGenerator(orderId, platformId, user, true);
    }

    // Step 10: Return updated vehicle information
    return {
        vehicle_type: vehicleType.name,
        new_rate: transportRate,
        reason: reason.trim(),
    };
};

// ----------------------------------- UPDATE ORDER TRIP TYPE --------------------------------
const updateOrderTripType = async (
    orderId: string,
    platformId: string,
    user: AuthUser,
    payload: UpdateTripTypePayload
) => {
    const { trip_type, reason } = payload;

    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
    });

    if (!order) throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    if (!["PRICING_REVIEW", "PENDING_APPROVAL"].includes(order.order_status))
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Trip type can only be changed during pricing review"
        );
    if (order.trip_type === trip_type)
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Trip type is already set to this value");

    const orderPricing = await db.query.prices.findFirst({
        where: and(eq(prices.id, order.order_pricing_id), eq(prices.platform_id, platformId)),
    });

    if (!orderPricing) throw new CustomizedError(httpStatus.NOT_FOUND, "Order pricing not found");

    const transportRateInfo = await TransportRatesServices.lookupTransportRate(
        platformId,
        order.company_id,
        order.venue_city_id,
        trip_type,
        order.vehicle_type_id
    );

    if (!transportRateInfo)
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "No transport rate found for selected trip type and vehicle"
        );

    const transportRate = Number(transportRateInfo.rate);
    const pricingSummary = calculatePricingSummary({
        base_ops_total: Number(orderPricing.base_ops_total),
        transport_rate: transportRate,
        catalog_total: Number((orderPricing.line_items as any)?.catalog_total || 0),
        custom_total: Number((orderPricing.line_items as any)?.custom_total || 0),
        margin_percent: Number((orderPricing.margin as any).percent),
    });

    await db.transaction(async (tx) => {
        await tx
            .update(prices)
            .set({
                logistics_sub_total: pricingSummary.logistics_sub_total.toFixed(2),
                transport: {
                    system_rate: transportRate,
                    final_rate: transportRate,
                },
                margin: {
                    ...(orderPricing.margin as Record<string, any>),
                    amount: pricingSummary.margin_amount,
                },
                final_total: pricingSummary.final_total.toFixed(2),
                calculated_at: new Date(),
                calculated_by: user.id,
            })
            .where(eq(prices.id, order.order_pricing_id));

        await tx
            .update(orders)
            .set({
                trip_type,
                updated_at: new Date(),
            })
            .where(eq(orders.id, orderId));
    });

    if (order.order_status !== "PRICING_REVIEW")
        await costEstimateGenerator(orderId, platformId, user, true);

    return {
        trip_type,
        new_rate: transportRate,
        reason: reason.trim(),
    };
};

// ----------------------------------- ADD TRUCK DETAILS -------------------------------------
const addTruckDetails = async (
    orderId: string,
    platformId: string,
    payload: TruckDetailsPayload
) => {
    // Step 1: Validate payload
    const { delivery_truck_details, pickup_truck_details } = payload;

    // Step 2: Fetch order and verify status
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 3: Update order truck details in transaction
    await db.transaction(async (tx) => {
        await tx
            .update(orders)
            .set({
                ...(delivery_truck_details && { delivery_truck_details }),
                ...(pickup_truck_details && { pickup_truck_details }),
            })
            .where(eq(orders.id, orderId));
    });

    // Step 4: Return updated truck details
    return {
        delivery_truck_details: delivery_truck_details || null,
        pickup_truck_details: pickup_truck_details || null,
    };
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
            vehicle_type: true,
            items: true,
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

    const buffer = await generateGoodsFormXlsx({
        form_type: resolvedFormType,
        order_id: order.order_id,
        company_name: order.company?.name || "",
        brand_name: order.brand?.name || "",
        venue_name: order.venue_name || "",
        venue_city: order.venue_city?.name || "",
        event_start_date: order.event_start_date,
        event_end_date: order.event_end_date,
        trip_type: order.trip_type,
        vehicle_type: order.vehicle_type?.name || "",
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
    updateOrderVehicle,
    downloadGoodsForm,
    updateOrderTripType,
    addTruckDetails,
};
