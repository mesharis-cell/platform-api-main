import z from "zod";

const createCompanyDomain = z.object({
    body: z.object({
        company_id: z.string().uuid({ message: "company_id must be a valid UUID" }),
        hostname: z.string().min(1, { message: "Hostname is required" }),
        type: z.enum(["VANITY", "CUSTOM"], { message: "Type must be VANITY or CUSTOM" }),
        is_verified: z.boolean().optional().default(false),
        is_active: z.boolean().optional().default(true),
    }),
});

const updateCompanyDomain = z.object({
    body: z.object({
        hostname: z.string().min(1, { message: "Hostname cannot be empty" }).optional(),
        type: z.enum(["VANITY", "CUSTOM"]).optional(),
        is_verified: z.boolean().optional(),
        is_active: z.boolean().optional(),
    }),
});

export const CompanyDomainSchemas = {
    createCompanyDomain,
    updateCompanyDomain,
};
