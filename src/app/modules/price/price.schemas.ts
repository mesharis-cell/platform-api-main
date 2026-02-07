import { z } from "zod";

const updatePriceForTransportSchema = z.object({
    body: z.object({
        transport_rate: z.number("Transport rate should be a number")
    }),
});

export const PriceSchemas = {
    updatePriceForTransportSchema
};
