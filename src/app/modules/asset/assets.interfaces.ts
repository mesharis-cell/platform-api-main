import z from "zod";
import { AssetSchemas } from "./asset.schemas";

export type CreateAssetPayload = z.infer<typeof AssetSchemas.createAssetSchema>["body"] & {
    platform_id: string;
};

export type UpdateAssetPayload = z.infer<typeof AssetSchemas.updateAssetSchema>["body"];
