import z from "zod";
import { userRoleEnum } from "../../../db/schema";
import { UserSchemas } from "./user.schemas";

export type CreateUserPayload = z.infer<typeof UserSchemas.createUser>["body"] & {
    platform_id: string;
};

export type UserRole = (typeof userRoleEnum.enumValues)[number];
