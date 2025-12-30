import { z } from "zod";

export const inboundScanSchema = z.object({
  body: z.object({
    qr_code: z.string().min(1, { message: "QR code is required" }),
    condition: z.enum(['GREEN', 'ORANGE', 'RED']),
    notes: z.string().optional(),
    photos: z.array(z.string()).optional(),
    refurb_days_estimate: z.number().int().positive().optional(),
    discrepancy_reason: z.enum(['BROKEN', 'LOST', 'OTHER']).optional(),
    quantity: z.number().int().positive().optional(),
  }),
});

export const outboundScanSchema = z.object({
  body: z.object({
    qr_code: z.string().min(1, { message: "QR code is required" }),
    quantity: z.number().int().positive().optional(),
  }),
});

export const ScanningSchemas = {
  inboundScanSchema,
  outboundScanSchema,
};
