import z from "zod";
import { brandsSchemas } from "./brand.schemas";

export type CreateBrandPayload = z.infer<typeof brandsSchemas.brandSchema>["body"] & {
  platform_id: string;
};

export type UpdateBrandPayload = z.infer<typeof brandsSchemas.updateBrandSchema>["body"];
