import { z } from "zod";

// ----------------------------------- CONFIRM PAYMENT SCHEMA ---------------------------------
export const confirmPayment = z.object({
    body: z
        .object({
            payment_method: z
                .string("Payment method should be a string")
                .min(1, "Payment method is required")
                .max(50, "Payment method should be less than 50 characters"),
            payment_reference: z
                .string("Payment reference should be a string")
                .min(1, "Payment reference is required")
                .max(100, "Payment reference should be less than 100 characters"),
            payment_date: z
                .string("Payment date should be a string")
                .optional()
                .refine((date) => date && !isNaN(Date.parse(date)), "Invalid payment date format"),
            notes: z.string("Notes should be a string").optional(),
        })
        .strict(),
});

// ----------------------------------- GENERATE INVOICE SCHEMA --------------------------------
export const generateInvoice = z.object({
    body: z
        .object({
            order_id: z.uuid("Order ID should be a valid UUID").optional(),
            service_request_id: z.uuid("Service request ID should be a valid UUID").optional(),
            regenerate: z.boolean("Regenerate should be a boolean").optional().default(false),
        })
        .refine((data) => !!data.order_id || !!data.service_request_id, {
            message: "Either order_id or service_request_id is required",
            path: ["order_id"],
        })
        .strict(),
});

export const invoiceSchemas = {
    confirmPayment,
    generateInvoice,
};
