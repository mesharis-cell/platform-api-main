import { vehicleTypes } from "../../../db/schema";
import { CreateVehicleTypePayload, UpdateVehicleTypePayload } from "./vehicle-type.interfaces";
import CustomizedError from "../../error/customized-error";
import httpStatus from "http-status";
import { db } from "../../../db";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import paginationMaker from "../../utils/pagination-maker";

const createVehicleType = async (data: CreateVehicleTypePayload) => {
  const { platform_id, name, vehicle_size, is_active, display_order, description, is_default } = data;

  const [existing] = await db
    .select()
    .from(vehicleTypes)
    .where(and(eq(vehicleTypes.platform_id, platform_id), eq(vehicleTypes.name, name)))
    .limit(1);

  if (existing) {
    throw new CustomizedError(
      httpStatus.CONFLICT,
      "Vehicle type with this name already exists"
    );
  }

  // If this is set as default, unset others first
  if (is_default) {
    await db
      .update(vehicleTypes)
      .set({ is_default: false })
      .where(eq(vehicleTypes.platform_id, platform_id));
  }

  const [result] = await db
    .insert(vehicleTypes)
    .values({
      platform_id,
      name,
      vehicle_size,
      is_active,
      display_order,
      description,
      is_default: is_default || false,
    })
    .returning();

  return result;
}

const getVehicleTypes = async (query: Record<string, any>, platformId: string) => {
  const { page, limit, include_inactive, search_term } = query;

  // Setup pagination
  const { pageNumber, limitNumber, skip } = paginationMaker({
    page,
    limit,
  });

  // Build WHERE conditions
  const conditions: any[] = [eq(vehicleTypes.platform_id, platformId)];

  if (!include_inactive) {
    conditions.push(eq(vehicleTypes.is_active, true));
  }

  if (search_term) {
    conditions.push(or(ilike(vehicleTypes.name, `%${search_term.trim()}%`), ilike(vehicleTypes.description, `%${search_term.trim()}%`)));
  }

  // Always sort by display_order, then name
  const [result, total] = await Promise.all([
    db
      .select()
      .from(vehicleTypes)
      .where(and(...conditions))
      .orderBy(desc(vehicleTypes.display_order), asc(vehicleTypes.name))
      .limit(limitNumber)
      .offset(skip),

    db
      .select({ count: count() })
      .from(vehicleTypes)
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

const updateVehicleType = async (id: string, data: UpdateVehicleTypePayload) => {
  const { platform_id, name, vehicle_size, is_active, display_order, description, is_default } = data;

  const [existing] = await db
    .select()
    .from(vehicleTypes)
    .where(and(eq(vehicleTypes.platform_id, platform_id), eq(vehicleTypes.id, id)))
    .limit(1);

  if (!existing) {
    throw new CustomizedError(httpStatus.NOT_FOUND, "Vehicle type not found");
  }

  // If setting as default, unset others
  if (is_default) {
    await db
      .update(vehicleTypes)
      .set({ is_default: false })
      .where(
        and(
          eq(vehicleTypes.platform_id, platform_id),
          // Don't need to exclude current ID since we'll update it right after, 
          // but logically it's cleaner to unset all then set one.
        )
      );
  }

  const [result] = await db
    .update(vehicleTypes)
    .set({
      name,
      vehicle_size,
      is_active,
      display_order,
      description,
      is_default,
    })
    .where(eq(vehicleTypes.id, id))
    .returning();

  return result;
};

export const VehicleTypeServices = {
  createVehicleType,
  getVehicleTypes,
  updateVehicleType,
};