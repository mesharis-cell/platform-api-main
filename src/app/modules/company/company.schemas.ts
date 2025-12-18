import z from "zod";

const settingsSchema = z.object({
  branding: z
    .object({
      title: z.string().optional(),
      logo_url: z.string().url().optional(),
      primary_color: z.string().optional(),
      secondary_color: z.string().optional(),
    }).default({}),
});

const createCompany = z.object({
  body: z.object({
    platform: z.string().uuid({ message: "Platform ID must be a valid UUID" }),
    name: z
      .string()
      .min(2, { message: "Company name must be at least 2 characters long" })
      .max(100, { message: "Company name cannot exceed 100 characters" }),
    domain: z
      .string()
      .min(1, { message: "Domain is required" })
      .max(50, { message: "Domain cannot exceed 50 characters" })
      .regex(/^[a-z0-9-]+$/, {
        message:
          "Domain must be lowercase and contain only alphanumeric characters and hyphens",
      }),
    settings: settingsSchema,
    isActive: z.boolean().optional().default(true),
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
      .regex(/^[a-z0-9-]+$/, {
        message:
          "Domain must be lowercase and contain only alphanumeric characters and hyphens",
      })
      .optional(),
    settings: settingsSchema.optional(),
    isActive: z.boolean().optional(),
  }),
});


export const CompanySchemas = {
  createCompany,
  updateCompany,
};
