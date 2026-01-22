/**
 * Order Cancellation Service
 * Handles order cancellation workflow with booking release and reskin cleanup
 */

import { and, eq, isNull } from 'drizzle-orm'
import httpStatus from 'http-status'
import { db } from '../../../db'
import {
  orders,
  assetBookings,
  reskinRequests,
  orderLineItems,
  orderStatusHistory,
  financialStatusHistory,
} from '../../../db/schema'
import CustomizedError from '../../error/customized-error'
import { AuthUser } from '../../interface/common'

export interface CancelOrderPayload {
  reason: 'client_requested' | 'asset_unavailable' | 'pricing_dispute' | 'event_cancelled' | 'fabrication_failed' | 'other'
  notes: string
  notify_client: boolean
}

// Non-cancellable statuses (items already left warehouse or order already terminal)
const NON_CANCELLABLE_STATUSES = [
  'READY_FOR_DELIVERY',
  'IN_TRANSIT',
  'DELIVERED',
  'IN_USE',
  'AWAITING_RETURN',
  'RETURN_IN_TRANSIT',
  'CLOSED',
  'DECLINED',
  'CANCELLED',
]

/**
 * Cancel an order before items leave the warehouse
 */
export async function cancelOrder(
  orderId: string,
  platformId: string,
  payload: CancelOrderPayload,
  user: AuthUser
) {
  const { reason, notes, notify_client } = payload

  // Get order
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
  })

  if (!order) {
    throw new CustomizedError(httpStatus.NOT_FOUND, 'Order not found')
  }

  // Validate order can be cancelled
  if (NON_CANCELLABLE_STATUSES.includes(order.order_status)) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      `Cannot cancel order in ${order.order_status} status. Items have already left the warehouse or order is already terminal.`
    )
  }

  await db.transaction(async (tx) => {
    // 1. Update order status
    await tx
      .update(orders)
      .set({
        order_status: 'CANCELLED',
        financial_status: 'CANCELLED',
        updated_at: new Date(),
      })
      .where(eq(orders.id, orderId))

    // 2. Release all asset bookings
    await tx.delete(assetBookings).where(eq(assetBookings.order_id, orderId))

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
      )

    for (const reskin of pendingReskins) {
      // Mark reskin as cancelled
      await tx
        .update(reskinRequests)
        .set({
          cancelled_at: new Date(),
          cancelled_by: user.id,
          cancellation_reason: 'Order cancelled',
        })
        .where(eq(reskinRequests.id, reskin.id))

      // Void linked line items
      await tx
        .update(orderLineItems)
        .set({
          is_voided: true,
          voided_at: new Date(),
          voided_by: user.id,
          void_reason: 'Order cancelled',
        })
        .where(eq(orderLineItems.reskin_request_id, reskin.id))
    }

    // 4. Log to order status history
    await tx.insert(orderStatusHistory).values({
      platform_id: platformId,
      order_id: orderId,
      status: 'CANCELLED',
      notes: `${reason}: ${notes}`,
      updated_by: user.id,
    })

    // 5. Log to financial status history
    await tx.insert(financialStatusHistory).values({
      platform_id: platformId,
      order_id: orderId,
      status: 'CANCELLED',
      notes: `${reason}: ${notes}`,
      updated_by: user.id,
    })
  })

  // 6. Send notifications
  // TODO: Implement notification logic
  // if (notify_client) {
  //   await sendNotification('ORDER_CANCELLED', { order, reason, notes, recipient: 'client' })
  // }
  // await sendNotification('ORDER_CANCELLED', { order, reason, notes, recipient: 'logistics' })

  return {
    success: true,
    order_id: order.order_id,
    cancelled_reskins: pendingReskins.length,
  }
}

/**
 * Check if order can be cancelled
 */
export function canCancelOrder(orderStatus: string): boolean {
  return !NON_CANCELLABLE_STATUSES.includes(orderStatus)
}

export const OrderCancellationService = {
  cancelOrder,
  canCancelOrder,
}
