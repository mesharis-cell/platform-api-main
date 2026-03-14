import z from "zod";
import { AssetFamilySchemas } from "./asset-family.schemas";

export type CreateAssetFamilyPayload = z.infer<
    typeof AssetFamilySchemas.createAssetFamilySchema
>["body"];

export type UpdateAssetFamilyPayload = z.infer<
    typeof AssetFamilySchemas.updateAssetFamilySchema
>["body"];
