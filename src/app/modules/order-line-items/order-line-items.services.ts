import { and, eq } from 'drizzle-orm'
import httpStatus from 'http-status'
import { db } from '../../../db'
import { orderLineItems, serviceTypes } from '../../../db/schema'
import CustomizedError from '../../error/customized-error'
import {
  CreateCatalogLineItemPayload,
  CreateCustomLineItemPayload,
  LineItemsTotals,
  UpdateLineItemPayload,
  VoidLineItemPayload,
} from './order-line-items.interfaces'

// ----------------------------------- LIST ORDER LINE ITEMS -----------------------------------
const listOrderLineItems = async (orderId: string, platformId: string) => {
  const items = await db
    .select()
    .from(orderLineItems)
    .where(
      and(
        eq(orderLineItems.order_id, orderId),
        eq(orderLineItems.platform_id, platformId)
      )
    )

  return items.map((item) => ({
    ...item,
    quantity: item.quantity ? parseFloat(item.quantity) : null,
    unit_rate: item.unit_rate ? parseFloat(item.unit_rate) : null,
    total: parseFloat(item.total),
  }))
}

// ----------------------------------- CREATE CATALOG LINE ITEM -----------------------------------
const createCatalogLineItem = async (data: CreateCatalogLineItemPayload) => {
  const { platform_id, order_id, service_type_id, quantity, unit_rate, notes, added_by } = data

  // Get service type details
  const [serviceType] = await db
    .select()
    .from(serviceTypes)
    .where(
      and(
        eq(serviceTypes.id, service_type_id),
        eq(serviceTypes.platform_id, platform_id)
      )
    )
    .limit(1)

  if (!serviceType) {
    throw new CustomizedError(httpStatus.NOT_FOUND, 'Service type not found')
  }

  // Calculate total
  const total = quantity * unit_rate

  const [result] = await db
    .insert(orderLineItems)
    .values({
      platform_id,
      order_id,
      service_type_id,
      reskin_request_id: null,
      line_item_type: 'CATALOG',
      category: serviceType.category,
      description: serviceType.name,
      quantity: quantity.toString(),
      unit: serviceType.unit,
      unit_rate: unit_rate.toString(),
      total: total.toString(),
      added_by,
      notes: notes || null,
    })
    .returning()

  return {
    ...result,
    quantity: result.quantity ? parseFloat(result.quantity) : null,
    unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
    total: parseFloat(result.total),
  }
}

// ----------------------------------- CREATE CUSTOM LINE ITEM -----------------------------------
const createCustomLineItem = async (data: CreateCustomLineItemPayload) => {
  const { platform_id, order_id, description, category, total, notes, reskin_request_id, added_by } = data

  const [result] = await db
    .insert(orderLineItems)
    .values({
      platform_id,
      order_id,
      service_type_id: null,
      reskin_request_id: reskin_request_id || null,
      line_item_type: 'CUSTOM',
      category: category as any,
      description,
      quantity: null,
      unit: null,
      unit_rate: null,
      total: total.toString(),
      added_by,
      notes: notes || null,
    })
    .returning()

  return {
    ...result,
    quantity: null,
    unit_rate: null,
    total: parseFloat(result.total),
  }
}

// ----------------------------------- UPDATE LINE ITEM -----------------------------------
const updateLineItem = async (
  id: string,
  orderId: string,
  platformId: string,
  data: UpdateLineItemPayload
) => {
  const [existing] = await db
    .select()
    .from(orderLineItems)
    .where(
      and(
        eq(orderLineItems.id, id),
        eq(orderLineItems.order_id, orderId),
        eq(orderLineItems.platform_id, platformId)
      )
    )
    .limit(1)

  if (!existing) {
    throw new CustomizedError(httpStatus.NOT_FOUND, 'Line item not found')
  }

  if (existing.is_voided) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      'Cannot update voided line item'
    )
  }

  const dbData: any = { ...data }

  // For catalog items, recalculate total if quantity or unit_rate changed
  if (existing.line_item_type === 'CATALOG') {
    const newQuantity = data.quantity !== undefined ? data.quantity : parseFloat(existing.quantity!)
    const newUnitRate = data.unit_rate !== undefined ? data.unit_rate : parseFloat(existing.unit_rate!)

    if (data.quantity !== undefined) {
      dbData.quantity = data.quantity.toString()
    }
    if (data.unit_rate !== undefined) {
      dbData.unit_rate = data.unit_rate.toString()
    }

    // Recalculate total
    const calculatedTotal = newQuantity * newUnitRate
    dbData.total = calculatedTotal.toString()
  } else if (data.total !== undefined) {
    // Custom item, allow total update
    dbData.total = data.total.toString()
  }

  const [result] = await db
    .update(orderLineItems)
    .set(dbData)
    .where(eq(orderLineItems.id, id))
    .returning()

  return {
    ...result,
    quantity: result.quantity ? parseFloat(result.quantity) : null,
    unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
    total: parseFloat(result.total),
  }
}

// ----------------------------------- VOID LINE ITEM -----------------------------------
const voidLineItem = async (
  id: string,
  orderId: string,
  platformId: string,
  data: VoidLineItemPayload
) => {
  const { void_reason, voided_by } = data

  const [existing] = await db
    .select()
    .from(orderLineItems)
    .where(
      and(
        eq(orderLineItems.id, id),
        eq(orderLineItems.order_id, orderId),
        eq(orderLineItems.platform_id, platformId)
      )
    )
    .limit(1)

  if (!existing) {
    throw new CustomizedError(httpStatus.NOT_FOUND, 'Line item not found')
  }

  if (existing.is_voided) {
    throw new CustomizedError(httpStatus.BAD_REQUEST, 'Line item is already voided')
  }

  const [result] = await db
    .update(orderLineItems)
    .set({
      is_voided: true,
      voided_at: new Date(),
      voided_by,
      void_reason,
    })
    .where(eq(orderLineItems.id, id))
    .returning()

  return {
    ...result,
    quantity: result.quantity ? parseFloat(result.quantity) : null,
    unit_rate: result.unit_rate ? parseFloat(result.unit_rate) : null,
    total: parseFloat(result.total),
  }
}

// ----------------------------------- CALCULATE LINE ITEMS TOTAL -----------------------------------
const calculateLineItemsTotals = async (orderId: string, platformId: string): Promise<LineItemsTotals> => {
  const items = await db
    .select()
    .from(orderLineItems)
    .where(
      and(
        eq(orderLineItems.order_id, orderId),
        eq(orderLineItems.platform_id, platformId),
        eq(orderLineItems.is_voided, false) // Exclude voided items
      )
    )

  let catalogTotal = 0
  let customTotal = 0

  for (const item of items) {
    const itemTotal = parseFloat(item.total)
    if (item.line_item_type === 'CATALOG') {
      catalogTotal += itemTotal
    } else {
      customTotal += itemTotal
    }
  }

  return {
    catalog_total: parseFloat(catalogTotal.toFixed(2)),
    custom_total: parseFloat(customTotal.toFixed(2)),
  }
}

export const OrderLineItemsServices = {
  listOrderLineItems,
  createCatalogLineItem,
  createCustomLineItem,
  updateLineItem,
  voidLineItem,
  calculateLineItemsTotals,
}
