import { Request, Response } from 'express'
import httpStatus from 'http-status'
import { OrderLineItemsServices } from './order-line-items.services'

// ----------------------------------- LIST ORDER LINE ITEMS -----------------------------------
const listOrderLineItems = async (req: Request, res: Response) => {
  const { platform_id } = req as any
  const { orderId } = req.params

  const items = await OrderLineItemsServices.listOrderLineItems(orderId, platform_id)

  return res.status(httpStatus.OK).json({
    success: true,
    data: items,
  })
}

// ----------------------------------- CREATE CATALOG LINE ITEM -----------------------------------
const createCatalogLineItem = async (req: Request, res: Response) => {
  const { platform_id, user } = req as any
  const { orderId } = req.params
  const payload = {
    ...req.body,
    platform_id,
    order_id: orderId,
    added_by: user.id,
  }

  const lineItem = await OrderLineItemsServices.createCatalogLineItem(payload)

  return res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Catalog line item added successfully',
    data: lineItem,
  })
}

// ----------------------------------- CREATE CUSTOM LINE ITEM -----------------------------------
const createCustomLineItem = async (req: Request, res: Response) => {
  const { platform_id, user } = req as any
  const { orderId } = req.params
  const payload = {
    ...req.body,
    platform_id,
    order_id: orderId,
    added_by: user.id,
  }

  const lineItem = await OrderLineItemsServices.createCustomLineItem(payload)

  return res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Custom line item added successfully',
    data: lineItem,
  })
}

// ----------------------------------- UPDATE LINE ITEM -----------------------------------
const updateLineItem = async (req: Request, res: Response) => {
  const { platform_id } = req as any
  const { orderId, itemId } = req.params
  const payload = req.body

  const lineItem = await OrderLineItemsServices.updateLineItem(
    itemId,
    orderId,
    platform_id,
    payload
  )

  return res.status(httpStatus.OK).json({
    success: true,
    message: 'Line item updated successfully',
    data: lineItem,
  })
}

// ----------------------------------- VOID LINE ITEM -----------------------------------
const voidLineItem = async (req: Request, res: Response) => {
  const { platform_id, user } = req as any
  const { orderId, itemId } = req.params
  const payload = {
    ...req.body,
    voided_by: user.id,
  }

  const lineItem = await OrderLineItemsServices.voidLineItem(
    itemId,
    orderId,
    platform_id,
    payload
  )

  return res.status(httpStatus.OK).json({
    success: true,
    message: 'Line item voided successfully',
    data: lineItem,
  })
}

export const OrderLineItemsControllers = {
  listOrderLineItems,
  createCatalogLineItem,
  createCustomLineItem,
  updateLineItem,
  voidLineItem,
}
