import z from "zod";

const createCompanyDomain = z.object({
  body: z.object({
    platform: z.string().uuid({ message: "Platform ID must be a valid UUID" }),
    company: z.string().uuid({ message: "Company ID must be a valid UUID" }),
    hostname: z.string().min(1, { message: "Hostname is required" }),
    type: z.string().min(1, { message: "Type is required" }),
    isVerified: z.boolean().optional().default(false),
    isActive: z.boolean().optional().default(true),
  }),
});

const updateCompanyDomain = z.object({
  body: z.object({
    hostname: z.string().min(1, { message: "Hostname cannot be empty" }).optional(),
    type: z.string().optional(),
    isVerified: z.boolean().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const CompanyDomainSchemas = {
  createCompanyDomain,
  updateCompanyDomain,
};
