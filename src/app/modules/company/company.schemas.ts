import z from "zod";

const settingsSchema = z.object({
    branding: z
        .object({
            title: z.string().optional(),
            logo_url: z.string().url().optional(),
            primary_color: z.string().optional(),
            secondary_color: z.string().optional(),
        })
        .default({}),
});

const createCompany = z.object({
    body: z.object({
        name: z
            .string()
            .min(2, { message: "Company name must be at least 2 characters long" })
            .max(100, { message: "Company name cannot exceed 100 characters" }),
        domain: z
            .string()
            .min(1, { message: "Domain is required" })
            .max(50, { message: "Domain cannot exceed 50 characters" }),
        settings: settingsSchema,
        platform_margin_percent: z
            .number("Platform margin percent should be a number")
            .min(0, { message: "Platform margin percent must be at least 0" })
            .max(100, { message: "Platform margin percent cannot exceed 100" })
            .optional(),
        warehouse_ops_rate: z
            .number("Warehouse ops rate should be a number")
            .min(0, { message: "Warehouse ops rate must be at least 0" })
            .optional(),
        contact_email: z
            .string()
            .email({ message: "Invalid email format" })
            .max(255, { message: "Email cannot exceed 255 characters" })
            .optional(),
        contact_phone: z
            .string()
            .max(50, { message: "Phone number cannot exceed 50 characters" })
            .optional(),
        is_active: z.boolean().optional().default(true),
    }),
});

const updateCompany = z.object({
    body: z.object({
        name: z
            .string()
            .min(2, { message: "Company name must be at least 2 characters long" })
            .max(100, { message: "Company name cannot exceed 100 characters" })
            .optional(),
        domain: z
            .string()
            .min(1, { message: "Domain is required" })
            .max(50, { message: "Domain cannot exceed 50 characters" })
            .optional(),
        settings: settingsSchema.optional(),
        platform_margin_percent: z
            .number()
            .min(0, { message: "Platform margin percent must be at least 0" })
            .max(100, { message: "Platform margin percent cannot exceed 100" })
            .optional(),
        warehouse_ops_rate: z
            .number("Warehouse ops rate should be a number")
            .min(0, { message: "Warehouse ops rate must be at least 0" })
            .optional(),
        contact_email: z
            .string()
            .email({ message: "Invalid email format" })
            .max(255, { message: "Email cannot exceed 255 characters" })
            .optional(),
        contact_phone: z
            .string()
            .max(50, { message: "Phone number cannot exceed 50 characters" })
            .optional(),
        is_active: z.boolean().optional(),
    }),
});

export const CompanySchemas = {
    createCompany,
    updateCompany,
};
