import { z } from "zod";

export const inboundScanSchema = z.object({
    body: z
        .object({
            qr_code: z.string().min(1, { message: "QR code is required" }),
            condition: z.enum(["GREEN", "ORANGE", "RED"]),
            notes: z.string().optional(),
            photos: z.array(z.string()).optional().default([]),
            refurb_days_estimate: z.number().int().positive().optional(),
            discrepancy_reason: z.enum(["BROKEN", "LOST", "OTHER"]).optional(),
            quantity: z.number().int().positive().optional(),
        })
        .superRefine((data, ctx) => {
            if (data.condition !== "GREEN" && data.photos.length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "At least one photo is required for damaged inbound items",
                    path: ["photos"],
                });
            }
        }),
});

export const outboundScanSchema = z.object({
    body: z.object({
        qr_code: z.string().min(1, { message: "QR code is required" }),
        quantity: z.number().int().positive().optional(),
    }),
});

export const uploadTruckPhotosSchema = z.object({
    body: z.object({
        photos: z.array(z.string()).min(1, { message: "At least one photo is required" }),
    }),
});

export const ScanningSchemas = {
    inboundScanSchema,
    outboundScanSchema,
    uploadTruckPhotosSchema,
};
