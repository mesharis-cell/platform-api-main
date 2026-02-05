import { and, eq, isNull } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    reskinRequests,
    orderItems,
    assets,
    orders,
    orderStatusHistory,
    orderLineItems,
    users,
    financialStatusHistory,
    prices,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import {
    ProcessReskinRequestPayload,
    CompleteReskinRequestPayload,
    ReskinStatus,
    CancelReskinRequestPayload,
} from "./reskin-requests.interfaces";
import { OrderLineItemsServices } from "../order-line-items/order-line-items.services";
import { generateAssetQRCode } from "../../utils/qr-generator";
import { NotificationLogServices } from "../notification-logs/notification-logs.services";
import { AuthUser } from "../../interface/common";
import { OrderServices } from "../order/order.services";
import { costEstimateGenerator } from "../../utils/cost-estimate";

// ----------------------------------- LIST RESKIN REQUESTS -----------------------------------
const listReskinRequests = async (orderId: string, platformId: string) => {
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

    return requests.map((req) => ({
        ...req,
        status: getReskinStatus(req),
    }));
};

// ----------------------------------- GET PENDING RESKINS -----------------------------------
const getPendingReskins = async (orderId: string, platformId: string) => {
    const pending = await db
        .select()
        .from(reskinRequests)
        .where(
            and(
                eq(reskinRequests.order_id, orderId),
                eq(reskinRequests.platform_id, platformId),
                isNull(reskinRequests.completed_at),
                isNull(reskinRequests.cancelled_at)
            )
        );

    return pending;
};

// ----------------------------------- PROCESS RESKIN REQUEST -----------------------------------
const processReskinRequest = async (
    orderItemId: string,
    orderId: string,
    platformId: string,
    payload: ProcessReskinRequestPayload
) => {
    const { cost, admin_notes, added_by } = payload;

    // Get order item with rebrand request
    const [orderItem] = await db.query.orderItems.findMany({
        where: and(
            eq(orderItems.id, orderItemId),
            eq(orderItems.order_id, orderId),
            eq(orderItems.platform_id, platformId)
        ),
        with: {
            asset: true,
        },
    });

    if (!orderItem) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order item not found");
    }

    if (!orderItem.is_reskin_request) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Order item is not a reskin request");
    }

    // Check if already processed
    const existing = await db
        .select()
        .from(reskinRequests)
        .where(eq(reskinRequests.order_item_id, orderItemId))
        .limit(1);

    if (existing.length > 0) {
        throw new CustomizedError(
            httpStatus.CONFLICT,
            "Reskin request already processed for this order item"
        );
    }

    // Create reskin_requests record
    const [reskinRequest] = (await db
        .insert(reskinRequests)
        .values({
            platform_id: platformId, // ✅ FIX: Use function parameter
            order_id: orderId,
            order_item_id: orderItemId,
            original_asset_id: orderItem.asset_id,
            original_asset_name: orderItem.asset_name,
            target_brand_id: orderItem.reskin_target_brand_id || null,
            target_brand_custom: orderItem.reskin_target_brand_custom || null,
            client_notes: orderItem.reskin_notes!,
            admin_notes: admin_notes || null,
        })
        .returning()) as Array<typeof reskinRequests.$inferSelect>;

    // Create custom line item for reskin cost
    const targetBrandName = orderItem.reskin_target_brand_custom || "Custom Brand";

    const lineItem = await OrderLineItemsServices.createCustomLineItem({
        platform_id: platformId, // ✅ FIX: Use function parameter
        order_id: orderId,
        description: `${orderItem.asset_name} Rebrand (${targetBrandName})`,
        category: "RESKIN",
        total: cost,
        notes: admin_notes ?? undefined,
        reskin_request_id: reskinRequest.id,
        added_by,
    });

    return {
        reskin_request: reskinRequest,
        line_item: lineItem,
    };
};

// ----------------------------------- COMPLETE RESKIN REQUEST -----------------------------------
const completeReskinRequest = async (
    reskinId: string,
    platformId: string,
    payload: CompleteReskinRequestPayload
) => {
    const { new_asset_name, completion_photos, completion_notes, completed_by } = payload;

    // Get reskin request
    const reskinRequest = await db.query.reskinRequests.findFirst({
        where: and(eq(reskinRequests.id, reskinId), eq(reskinRequests.platform_id, platformId)),
        with: {
            original_asset: true,
            order_item: {
                with: {
                    order: true,
                },
            },
        },
    });

    if (!reskinRequest) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Reskin request not found");
    }

    if (reskinRequest.completed_at) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Reskin request already completed");
    }

    if (reskinRequest.cancelled_at) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Reskin request was cancelled");
    }

    const originalAsset: any = reskinRequest.original_asset;

    // Create new asset (copy specs from original)
    const [newAsset] = (await db
        .insert(assets)
        .values({
            platform_id: originalAsset.platform_id,
            company_id: originalAsset.company_id,
            warehouse_id: originalAsset.warehouse_id,
            zone_id: originalAsset.zone_id,
            brand_id: reskinRequest.target_brand_id || null,

            name: new_asset_name,
            description: originalAsset.description,
            category: originalAsset.category,

            // Copy physical specs
            volume_per_unit: originalAsset.volume_per_unit,
            weight_per_unit: originalAsset.weight_per_unit,
            dimensions: originalAsset.dimensions,
            packaging: originalAsset.packaging || null,

            // New identity
            images: completion_photos,
            tracking_method: originalAsset.tracking_method,
            total_quantity: originalAsset.total_quantity,
            available_quantity: originalAsset.available_quantity,
            qr_code: generateAssetQRCode(new_asset_name, originalAsset.company_id),

            // Fresh condition
            status: "AVAILABLE" as any,
            condition: "GREEN" as any,
            condition_notes: null,
            handling_tags: originalAsset.handling_tags,

            // Lineage
            transformed_from: originalAsset.id,
        })
        .returning()) as Array<typeof assets.$inferSelect>;

    // Update original asset
    await db
        .update(assets)
        .set({
            status: "TRANSFORMED",
            transformed_to: newAsset.id,
        })
        .where(eq(assets.id, originalAsset.id));

    // Update order item to reference new asset
    await db
        .update(orderItems)
        .set({
            asset_id: newAsset.id,
            asset_name: new_asset_name,
        })
        .where(eq(orderItems.id, reskinRequest.order_item_id));

    // Update reskin request
    await db
        .update(reskinRequests)
        .set({
            new_asset_id: newAsset.id,
            new_asset_name,
            completed_at: new Date(),
            completed_by,
            completion_notes: completion_notes || null,
            completion_photos: completion_photos,
        })
        .where(eq(reskinRequests.id, reskinId));

    // Check if all reskins complete for this order
    const stillPending = await getPendingReskins(reskinRequest.order_id, platformId);

    // If all complete and order is AWAITING_FABRICATION, transition to IN_PREPARATION
    if (
        stillPending.length === 0 &&
        reskinRequest.order_item &&
        (reskinRequest.order_item as any).order
    ) {
        const order: any = (reskinRequest.order_item as any).order;
        if (order.order_status === "AWAITING_FABRICATION") {
            await db
                .update(orders)
                .set({
                    order_status: "IN_PREPARATION",
                    updated_at: new Date(),
                })
                .where(eq(orders.id, order.id));

            await db.insert(orderStatusHistory).values({
                platform_id: platformId,
                order_id: order.id,
                status: "IN_PREPARATION",
                notes: "All fabrication complete, ready for preparation",
                updated_by: completed_by,
            });

            const orderForNotification = await db.query.orders.findFirst({
                where: eq(orders.id, order.id),
                with: { company: true },
            });

            if (orderForNotification) {
                await NotificationLogServices.sendNotification(
                    platformId,
                    "FABRICATION_COMPLETE",
                    orderForNotification,
                    undefined,
                    {
                        fabrication_items: [
                            {
                                original_asset_name: originalAsset.name,
                                new_asset_name: new_asset_name,
                                new_qr_code: newAsset.qr_code,
                            },
                        ],
                    }
                );
            }
        }
    }

    return {
        reskin_request: await db.query.reskinRequests.findFirst({
            where: eq(reskinRequests.id, reskinId),
        }),
        new_asset: newAsset,
        all_complete: stillPending.length === 0,
    };
};

// ----------------------------------- CANCEL RESKIN REQUEST -----------------------------------
const cancelReskinRequest = async (
    reskinId: string,
    platformId: string,
    payload: CancelReskinRequestPayload,
    user: AuthUser
) => {
    const { cancellation_reason, order_action, cancelled_by } = payload;

    // Get reskin request
    const reskinRequest = await db.query.reskinRequests.findFirst({
        where: and(eq(reskinRequests.id, reskinId), eq(reskinRequests.platform_id, platformId)),
        with: {
            order_item: {
                with: {
                    order: true,
                },
            },
        },
    });

    if (!reskinRequest) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Reskin request not found");
    }

    if (reskinRequest.completed_at) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Cannot cancel completed reskin request");
    }

    if (reskinRequest.cancelled_at) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Reskin request already cancelled");
    }

    await db.transaction(async (tx) => {
        // Mark reskin request as cancelled
        await tx
            .update(reskinRequests)
            .set({
                cancelled_at: new Date(),
                cancelled_by,
                cancellation_reason,
            })
            .where(eq(reskinRequests.id, reskinId));

        // Void linked line items (reskin cost)
        await tx
            .update(orderLineItems)
            .set({
                is_voided: true,
                voided_at: new Date(),
                voided_by: cancelled_by,
                void_reason: `Reskin cancelled: ${cancellation_reason}`,
            })
            .where(eq(orderLineItems.reskin_request_id, reskinId));

        // Clear rebrand fields on order_item (continue with original asset)
        await tx
            .update(orderItems)
            .set({
                is_reskin_request: false,
                reskin_target_brand_id: null,
                reskin_target_brand_custom: null,
                reskin_notes: null,
            })
            .where(eq(orderItems.id, reskinRequest.order_item_id));
    });

    const orderRecord = await db.query.orders.findFirst({
        where: eq(orders.id, reskinRequest.order_id),
        with: { company: true, order_pricing: true },
    });

    if (!orderRecord) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    const orderPricing = orderRecord.order_pricing;

    if (order_action === "cancel_order") {
        const [userRecord] = await db
            .select()
            .from(users)
            .where(eq(users.id, cancelled_by))
            .limit(1);

        if (!userRecord) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "User not found");
        }

        const authUser: AuthUser = {
            id: userRecord.id,
            name: userRecord.name,
            email: userRecord.email,
            role: userRecord.role as any,
            company_id: userRecord.company_id,
            platform_id: userRecord.platform_id,
            permissions: userRecord.permissions || [],
            iat: 0,
            exp: 0,
        };

        const cancellationResult = await OrderServices.cancelOrder(
            reskinRequest.order_id,
            platformId,
            {
                reason: "fabrication_failed",
                notes: `Reskin cancelled: ${cancellation_reason}`,
                notify_client: true,
            },
            authUser
        );

        return {
            action: "cancel_order",
            ...cancellationResult,
        };
    }

    const previousTotal = orderPricing.final_total || null;

    // Step 4: Get line items totals
    const lineItemsTotals = await OrderLineItemsServices.calculateLineItemsTotals(
        orderRecord.id,
        platformId
    );

    // Step 5: Calculate final pricing
    const baseOpsTotal = Number(orderPricing.base_ops_total);
    const logisticsSubtotal = baseOpsTotal + Number((orderPricing.transport as any).final_rate) + lineItemsTotals.catalog_total;
    const marginAmount = logisticsSubtotal * (Number((orderPricing.margin as any).percent) / 100);
    const finalTotal = logisticsSubtotal + marginAmount + lineItemsTotals.custom_total;

    const newPricing = {
        logistics_sub_total: logisticsSubtotal.toFixed(2),
        line_items: {
            catalog_total: lineItemsTotals.catalog_total,
            custom_total: lineItemsTotals.custom_total,
        },
        margin: {
            ...(orderPricing.margin as any),
            amount: marginAmount,
        },
        final_total: finalTotal.toFixed(2),
        calculated_at: new Date(),
        calculated_by: user.id,
    }

    const shouldReviseQuote = ["QUOTED", "CONFIRMED", "AWAITING_FABRICATION", "IN_PREPARATION"].includes(
        orderRecord.order_status
    );
    const nextOrderStatus = shouldReviseQuote ? "QUOTED" : orderRecord.order_status;
    const nextFinancialStatus = shouldReviseQuote ? "QUOTE_REVISED" : orderRecord.financial_status;

    const [updatedOrderPricing] = await db
        .update(prices)
        .set({
            ...newPricing,
            updated_at: new Date(),
        })
        .where(eq(prices.id, orderRecord.order_pricing_id))
        .returning();

    await db
        .update(orders)
        .set({
            order_status: nextOrderStatus,
            financial_status: nextFinancialStatus,
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderRecord.id));

    if (nextOrderStatus !== orderRecord.order_status) {
        await db.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderRecord.id,
            status: nextOrderStatus as any,
            notes: `Quote revised after reskin cancellation: ${cancellation_reason}`,
            updated_by: cancelled_by,
        });
    }

    if (nextFinancialStatus !== orderRecord.financial_status) {
        await db.insert(financialStatusHistory).values({
            platform_id: platformId,
            order_id: orderRecord.id,
            status: nextFinancialStatus as any,
            notes: `Quote revised after reskin cancellation: ${cancellation_reason}`,
            updated_by: cancelled_by,
        });
    }

    await costEstimateGenerator(orderRecord.id, platformId, user);

    if (shouldReviseQuote) {
        await NotificationLogServices.sendNotification(
            platformId,
            "QUOTE_REVISED",
            orderRecord,
            undefined,
            {
                previous_total: previousTotal,
                new_total: finalTotal,
                revision_reason: cancellation_reason,
            }
        );
    }

    return {
        action: "continue",
        order_id: reskinRequest.order_id,
        pricing: updatedOrderPricing,
    };
};

// ----------------------------------- HELPER: GET RESKIN STATUS -----------------------------------
export function getReskinStatus(reskin: any): ReskinStatus {
    if (reskin.cancelled_at) return "cancelled";
    if (reskin.completed_at) return "complete";
    return "pending";
}

export const ReskinRequestsServices = {
    listReskinRequests,
    getPendingReskins,
    processReskinRequest,
    completeReskinRequest,
    cancelReskinRequest,
    getReskinStatus,
};
