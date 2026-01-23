import z from "zod";

const setPricingConfigSchema = z.object({
    body: z
        .object({
            warehouse_ops_rate: z
                .number({ message: "Warehouse operations rate must be a number" })
                .min(0, "Warehouse operations rate must be at least 0"),
        })
        .strict(),
});

export const PricingConfigSchemas = {
    setPricingConfigSchema,
};
