import z from "zod";
import { zoneSchemas } from "./zone.schemas";

export type CreateZonePayload = z.infer<typeof zoneSchemas.zoneSchema>["body"] & {
    platform_id: string;
};

export type UpdateZonePayload = z.infer<typeof zoneSchemas.updateZoneSchema>["body"];
