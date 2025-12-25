import z from "zod";
import { userRoleEnum } from "../../../db/schema";
import { enumMessageGenerator } from "../../utils/helper";

// Permission template enum
const permissionTemplateEnum = z.enum(
  ["PLATFORM_ADMIN", "LOGISTICS_STAFF", "CLIENT_USER"]
).default("CLIENT_USER");

const createUser = z.object({
  body: z.object({
    company_id: z
      .uuid("Company ID must be a valid UUID")
      .optional()
      .nullable(),
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
    role: z.enum(userRoleEnum.enumValues, { message: enumMessageGenerator("Role", userRoleEnum.enumValues) }).optional().default("CLIENT"),
    permissions: z
      .array(z.string(), {
        error: "Permissions must be an array of strings",
      })
      .optional()
      .default([]),
    permission_template: permissionTemplateEnum.optional().nullable(),
    is_active: z.boolean().optional().default(true),
  }),
});

const updateUser = z.object({
  body: z.object({
    company_id: z
      .uuid("Company ID must be a valid UUID")
      .optional()
      .nullable(),
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
    permission_template: permissionTemplateEnum.optional().nullable(),
    is_active: z.boolean().optional(),
  }),
});

export const UserSchemas = {
  createUser,
  updateUser,
};
