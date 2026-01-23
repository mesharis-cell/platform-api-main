import { z } from "zod";

// Time series query schema
export const timeSeriesQuerySchema = z.object({
    query: z
        .object({
            groupBy: z.enum(["month", "quarter", "year"]),
            companyId: z.string().uuid("Invalid company ID format").optional(),
            startDate: z.string().datetime("Invalid date format. Use ISO 8601 format").optional(),
            endDate: z.string().datetime("Invalid date format. Use ISO 8601 format").optional(),
        })
        .strict()
        .refine(
            (data) => {
                // If both dates are provided, validate the range
                if (data.startDate && data.endDate) {
                    const start = new Date(data.startDate);
                    const end = new Date(data.endDate);
                    return start <= end;
                }
                return true;
            },
            {
                message: "startDate must be before or equal to endDate",
                path: ["startDate"],
            }
        ),
});

export const analyticsSchemas = {
    timeSeriesQuerySchema,
};
