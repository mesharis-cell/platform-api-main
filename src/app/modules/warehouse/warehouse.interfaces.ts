import z from "zod";
import { warehouseSchemas } from "./warehouse.schemas";

export type CreateWarehousePayload = z.infer<typeof warehouseSchemas.warehouseSchema>["body"] & {
    platform_id: string;
};

export type UpdateWarehousePayload = z.infer<typeof warehouseSchemas.updateWarehouseSchema>["body"];
