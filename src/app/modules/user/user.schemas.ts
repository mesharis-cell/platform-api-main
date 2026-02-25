import z from "zod";
import { permissionTemplateEnum, userRoleEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

const createUser = z.object({
    body: z
        .object({
            company_id: z.uuid("Company ID must be a valid UUID").optional().nullable(),
            name: z
                .string({ error: "Name is required" })
                .min(1, "Name cannot be empty")
                .max(100, "Name must be at most 100 characters"),
            email: z
                .email("Invalid email address")
                .max(255, "Email must be at most 255 characters"),
            password: z
                .string({ error: "Password is required" })
                .min(8, "Password must be at least 8 characters")
                .max(50, "Password must be at most 50 characters"),
            role: z
                .enum(userRoleEnum.enumValues, {
                    message: enumMessageGenerator("Role", userRoleEnum.enumValues),
                })
                .optional()
                .default("CLIENT"),
            permissions: z
                .array(z.string(), {
                    error: "Permissions must be an array of strings",
                })
                .optional()
                .default([]),
            permission_template: z
                .enum(permissionTemplateEnum.enumValues, {
                    message: enumMessageGenerator(
                        "Permission Template",
                        permissionTemplateEnum.enumValues
                    ),
                })
                .optional()
                .nullable(),
            is_active: z.boolean().optional().default(true),
        })
        .strict()
        .refine((data) => {
            if (data.role === "CLIENT" && !data.company_id) {
                return false;
            }
            return true;
        }, "Company ID is required for CLIENT role"),
});

const updateUser = z.object({
    body: z
        .object({
            company_id: z.uuid("Company ID must be a valid UUID").optional().nullable(),
            name: z
                .string()
                .min(1, "Name cannot be empty")
                .max(100, "Name must be at most 100 characters")
                .optional(),
            permissions: z
                .array(z.string(), {
                    error: "Permissions must be an array of strings",
                })
                .optional(),
            permission_template: z
                .enum(permissionTemplateEnum.enumValues, {
                    message: enumMessageGenerator(
                        "Permission Template",
                        permissionTemplateEnum.enumValues
                    ),
                })
                .optional()
                .nullable(),
            is_active: z.boolean().optional(),
            is_super_admin: z.boolean().optional(),
        })
        .strict(),
});

export const UserSchemas = {
    createUser,
    updateUser,
};
