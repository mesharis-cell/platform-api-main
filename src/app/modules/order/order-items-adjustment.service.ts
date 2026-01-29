// /**
//  * Order Items Adjustment Service
//  * Handle add/remove/update order items during PRICING_REVIEW
//  */

// import { and, eq } from "drizzle-orm";
// import httpStatus from "http-status";
// import { db } from "../../../db";
// import { orders, orderItems, assets, orderStatusHistory, reskinRequests } from "../../../db/schema";
// import CustomizedError from "../../error/customized-error";
// import { recalculateOrderPricing } from "./order-pricing.helpers";

// /**
//  * Remove order item during PRICING_REVIEW
//  */
// export async function removeOrderItem(
//     orderId: string,
//     orderItemId: string,
//     platformId: string,
//     userId: string
// ) {
//     // Get order
//     const order = await db.query.orders.findFirst({
//         where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
//         with: { items: true },
//     });

//     if (!order) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
//     }

//     if (order.order_status !== "PRICING_REVIEW") {
//         throw new CustomizedError(
//             httpStatus.BAD_REQUEST,
//             "Can only adjust items during PRICING_REVIEW"
//         );
//     }

//     // Verify item belongs to order
//     const orderItem = order.items.find((item) => item.id === orderItemId);
//     if (!orderItem) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Order item not found");
//     }

//     // Cannot remove if it has an active reskin request
//     const reskinRequest = await db.query.reskinRequests.findFirst({
//         where: and(
//             eq(reskinRequests.order_item_id, orderItemId),
//             eq(reskinRequests.cancelled_at, null as any)
//         ),
//     });

//     if (reskinRequest) {
//         throw new CustomizedError(
//             httpStatus.BAD_REQUEST,
//             "Cannot remove item with active reskin request. Cancel reskin first."
//         );
//     }

//     // Delete order item
//     await db.delete(orderItems).where(eq(orderItems.id, orderItemId));

//     // Recalculate pricing
//     const updatedPricing = await recalculateOrderPricing(
//         orderId,
//         platformId,
//         order.company_id,
//         userId
//     );

//     // Update order pricing
//     await db
//         .update(orders)
//         .set({
//             pricing: updatedPricing as any,
//             updated_at: new Date(),
//         })
//         .where(eq(orders.id, orderId));

//     // Log history
//     await db.insert(orderStatusHistory).values({
//         platform_id: platformId,
//         order_id: orderId,
//         status: order.order_status,
//         notes: `Order item removed: ${orderItem.asset_name} (x${orderItem.quantity})`,
//         updated_by: userId,
//     });

//     return {
//         order_id: order.order_id,
//         removed_item: {
//             asset_name: orderItem.asset_name,
//             quantity: orderItem.quantity,
//         },
//         pricing: updatedPricing,
//     };
// }

// /**
//  * Add order item during PRICING_REVIEW
//  */
// export async function addOrderItem(
//     orderId: string,
//     platformId: string,
//     payload: {
//         asset_id: string;
//         quantity: number;
//     },
//     userId: string
// ) {
//     const { asset_id, quantity } = payload;

//     // Get order
//     const order = await db.query.orders.findFirst({
//         where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
//     });

//     if (!order) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
//     }

//     if (order.order_status !== "PRICING_REVIEW") {
//         throw new CustomizedError(
//             httpStatus.BAD_REQUEST,
//             "Can only adjust items during PRICING_REVIEW"
//         );
//     }

//     // Get asset
//     const asset = await db.query.assets.findFirst({
//         where: and(eq(assets.id, asset_id), eq(assets.platform_id, platformId)),
//     });

//     if (!asset) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
//     }

//     if (asset.company_id !== order.company_id) {
//         throw new CustomizedError(httpStatus.FORBIDDEN, "Asset not available for this company");
//     }

//     // Check availability
//     if (quantity > asset.available_quantity) {
//         throw new CustomizedError(
//             httpStatus.BAD_REQUEST,
//             `Only ${asset.available_quantity} units available`
//         );
//     }

//     // Add order item
//     const volumePerUnit = parseFloat(asset.volume_per_unit);
//     const weightPerUnit = parseFloat(asset.weight_per_unit);

//     await db.insert(orderItems).values({
//         platform_id: platformId,
//         order_id: orderId,
//         asset_id: asset.id,
//         asset_name: asset.name,
//         quantity,
//         volume_per_unit: asset.volume_per_unit,
//         weight_per_unit: asset.weight_per_unit,
//         total_volume: (volumePerUnit * quantity).toFixed(3),
//         total_weight: (weightPerUnit * quantity).toFixed(2),
//         condition_notes: null,
//         handling_tags: asset.handling_tags || [],
//         is_reskin_request: false,
//     });

//     // Recalculate pricing
//     const updatedPricing = await recalculateOrderPricing(
//         orderId,
//         platformId,
//         order.company_id,
//         userId
//     );

//     // Update order
//     await db
//         .update(orders)
//         .set({
//             pricing: updatedPricing as any,
//             updated_at: new Date(),
//         })
//         .where(eq(orders.id, orderId));

//     // Log history
//     await db.insert(orderStatusHistory).values({
//         platform_id: platformId,
//         order_id: orderId,
//         status: order.order_status,
//         notes: `Order item added: ${asset.name} (x${quantity})`,
//         updated_by: userId,
//     });

//     return {
//         order_id: order.order_id,
//         added_item: {
//             asset_name: asset.name,
//             quantity,
//         },
//         pricing: updatedPricing,
//     };
// }

// /**
//  * Update order item quantity during PRICING_REVIEW
//  */
// export async function updateOrderItemQuantity(
//     orderId: string,
//     orderItemId: string,
//     platformId: string,
//     quantity: number,
//     userId: string
// ) {
//     // Get order
//     const order = await db.query.orders.findFirst({
//         where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
//         with: { items: true },
//     });

//     if (!order) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
//     }

//     if (order.order_status !== "PRICING_REVIEW") {
//         throw new CustomizedError(
//             httpStatus.BAD_REQUEST,
//             "Can only adjust items during PRICING_REVIEW"
//         );
//     }

//     // Verify item belongs to order
//     const orderItem = order.items.find((item) => item.id === orderItemId);
//     if (!orderItem) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Order item not found");
//     }

//     // Get asset for availability check
//     const asset = await db.query.assets.findFirst({
//         where: eq(assets.id, orderItem.asset_id),
//     });

//     if (!asset) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
//     }

//     if (quantity > asset.available_quantity + orderItem.quantity) {
//         throw new CustomizedError(
//             httpStatus.BAD_REQUEST,
//             `Only ${asset.available_quantity + orderItem.quantity} units available`
//         );
//     }

//     // Update quantity and recalculate totals
//     const volumePerUnit = parseFloat(orderItem.volume_per_unit);
//     const weightPerUnit = parseFloat(orderItem.weight_per_unit);

//     await db
//         .update(orderItems)
//         .set({
//             quantity,
//             total_volume: (volumePerUnit * quantity).toFixed(3),
//             total_weight: (weightPerUnit * quantity).toFixed(2),
//         })
//         .where(eq(orderItems.id, orderItemId));

//     // Recalculate pricing
//     const updatedPricing = await recalculateOrderPricing(
//         orderId,
//         platformId,
//         order.company_id,
//         userId
//     );

//     // Update order
//     await db
//         .update(orders)
//         .set({
//             pricing: updatedPricing as any,
//             updated_at: new Date(),
//         })
//         .where(eq(orders.id, orderId));

//     // Log history
//     await db.insert(orderStatusHistory).values({
//         platform_id: platformId,
//         order_id: orderId,
//         status: order.order_status,
//         notes: `Item quantity updated: ${orderItem.asset_name} (${orderItem.quantity} → ${quantity})`,
//         updated_by: userId,
//     });

//     return {
//         order_id: order.order_id,
//         updated_item: {
//             asset_name: orderItem.asset_name,
//             old_quantity: orderItem.quantity,
//             new_quantity: quantity,
//         },
//         pricing: updatedPricing,
//     };
// }

// export const OrderItemsAdjustmentService = {
//     removeOrderItem,
//     addOrderItem,
//     updateOrderItemQuantity,
// };
