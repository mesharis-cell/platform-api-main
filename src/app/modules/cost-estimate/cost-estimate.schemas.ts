import { z } from 'zod'


// Download Cost Estimate Schema
export const downloadCostEstimateSchema = z.object({
    params: z.object({
        order_id: z.string().min(1, 'Order ID is required'),
    }),
})
