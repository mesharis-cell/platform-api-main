import z from "zod";
import { AccessPolicySchemas } from "./access-policy.schemas";

export type CreateAccessPolicyPayload = z.infer<
    typeof AccessPolicySchemas.createAccessPolicySchema
>["body"];

export type UpdateAccessPolicyPayload = z.infer<
    typeof AccessPolicySchemas.updateAccessPolicySchema
>["body"];
