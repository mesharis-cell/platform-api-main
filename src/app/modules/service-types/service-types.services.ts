import { and, asc, count, desc, eq, ilike } from 'drizzle-orm'
import httpStatus from 'http-status'
import { db } from '../../../db'
import { serviceTypes } from '../../../db/schema'
import CustomizedError from '../../error/customized-error'
import paginationMaker from '../../utils/pagination-maker'
import { CreateServiceTypePayload, UpdateServiceTypePayload } from './service-types.interfaces'

// ----------------------------------- LIST SERVICE TYPES -----------------------------------
const listServiceTypes = async (query: Record<string, any>, platformId: string) => {
  const { page, limit, category, include_inactive, search_term } = query

  // Setup pagination
  const { pageNumber, limitNumber, skip } = paginationMaker({
    page,
    limit,
  })

  // Build WHERE conditions
  const conditions: any[] = [eq(serviceTypes.platform_id, platformId)]

  if (category) {
    conditions.push(eq(serviceTypes.category, category as any))
  }

  if (!include_inactive) {
    conditions.push(eq(serviceTypes.is_active, true))
  }

  if (search_term) {
    conditions.push(ilike(serviceTypes.name, `%${search_term.trim()}%`))
  }

  // Always sort by display_order, then name
  const [result, total] = await Promise.all([
    db
      .select()
      .from(serviceTypes)
      .where(and(...conditions))
      .orderBy(asc(serviceTypes.display_order), asc(serviceTypes.name))
      .limit(limitNumber)
      .offset(skip),

    db
      .select({ count: count() })
      .from(serviceTypes)
      .where(and(...conditions)),
  ])

  return {
    meta: {
      page: pageNumber,
      limit: limitNumber,
      total: total[0].count,
    },
    data: result.map((type) => ({
      ...type,
      default_rate: type.default_rate ? parseFloat(type.default_rate) : null,
    })),
  }
}

// ----------------------------------- GET SERVICE TYPE BY ID -----------------------------------
const getServiceTypeById = async (id: string, platformId: string) => {
  const [type] = await db
    .select()
    .from(serviceTypes)
    .where(and(eq(serviceTypes.id, id), eq(serviceTypes.platform_id, platformId)))
    .limit(1)

  if (!type) {
    throw new CustomizedError(httpStatus.NOT_FOUND, 'Service type not found')
  }

  return {
    ...type,
    default_rate: type.default_rate ? parseFloat(type.default_rate) : null,
  }
}

// ----------------------------------- CREATE SERVICE TYPE -----------------------------------
const createServiceType = async (data: CreateServiceTypePayload) => {
  const { platform_id, name, category, unit, default_rate, description, display_order, is_active } = data

  // Check for duplicate name
  const [existing] = await db
    .select()
    .from(serviceTypes)
    .where(and(eq(serviceTypes.platform_id, platform_id), eq(serviceTypes.name, name)))
    .limit(1)

  if (existing) {
    throw new CustomizedError(
      httpStatus.CONFLICT,
      'Service type with this name already exists'
    )
  }

  const [result] = await db
    .insert(serviceTypes)
    .values({
      platform_id,
      name,
      category: category as any,
      unit,
      default_rate: default_rate !== undefined && default_rate !== null ? default_rate.toString() : null,
      description: description || null,
      display_order: display_order ?? 0,
      is_active: is_active ?? true,
    })
    .returning()

  return {
    ...result,
    default_rate: result.default_rate ? parseFloat(result.default_rate) : null,
  }
}

// ----------------------------------- UPDATE SERVICE TYPE -----------------------------------
const updateServiceType = async (
  id: string,
  platformId: string,
  data: UpdateServiceTypePayload
) => {
  const [existing] = await db
    .select()
    .from(serviceTypes)
    .where(and(eq(serviceTypes.id, id), eq(serviceTypes.platform_id, platformId)))
    .limit(1)

  if (!existing) {
    throw new CustomizedError(httpStatus.NOT_FOUND, 'Service type not found')
  }

  // Check name uniqueness if name is being updated
  if (data.name && data.name !== existing.name) {
    const [duplicate] = await db
      .select()
      .from(serviceTypes)
      .where(
        and(
          eq(serviceTypes.platform_id, platformId),
          eq(serviceTypes.name, data.name)
        )
      )
      .limit(1)

    if (duplicate) {
      throw new CustomizedError(
        httpStatus.CONFLICT,
        'Service type with this name already exists'
      )
    }
  }

  const dbData: any = { ...data }
  if (data.default_rate !== undefined) {
    dbData.default_rate = data.default_rate !== null ? data.default_rate.toString() : null
  }

  const [result] = await db
    .update(serviceTypes)
    .set(dbData)
    .where(eq(serviceTypes.id, id))
    .returning()

  return {
    ...result,
    default_rate: result.default_rate ? parseFloat(result.default_rate) : null,
  }
}

// ----------------------------------- DELETE SERVICE TYPE -----------------------------------
const deleteServiceType = async (id: string, platformId: string) => {
  const [existing] = await db
    .select()
    .from(serviceTypes)
    .where(and(eq(serviceTypes.id, id), eq(serviceTypes.platform_id, platformId)))
    .limit(1)

  if (!existing) {
    throw new CustomizedError(httpStatus.NOT_FOUND, 'Service type not found')
  }

  // Soft delete by setting is_active to false
  await db
    .update(serviceTypes)
    .set({ is_active: false })
    .where(eq(serviceTypes.id, id))

  return null
}

export const ServiceTypesServices = {
  listServiceTypes,
  getServiceTypeById,
  createServiceType,
  updateServiceType,
  deleteServiceType,
}
