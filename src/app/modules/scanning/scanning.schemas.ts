import { z } from "zod";

const damageReportEntrySchema = z.object({
    url: z.string().min(1, { message: "Damage image URL is required" }),
    description: z.string().max(1000, "Damage image description is too long").optional(),
});

export const inboundScanSchema = z.object({
    body: z
        .object({
            qr_code: z.string().min(1, { message: "QR code is required" }),
            condition: z.enum(["GREEN", "ORANGE", "RED"]),
            notes: z.string().optional(),
            latest_return_images: z
                .array(z.string())
                .min(2, { message: "At least 2 wide return photos are required" }),
            damage_report_entries: z.array(damageReportEntrySchema).optional().default([]),
            damage_report_photos: z.array(z.string()).optional().default([]),
            refurb_days_estimate: z.number().int().positive().optional(),
            discrepancy_reason: z.enum(["BROKEN", "LOST", "OTHER"]).optional(),
            quantity: z.number().int().positive().optional(),
        })
        .superRefine((data, ctx) => {
            const damageEntryCount =
                data.damage_report_entries.length + data.damage_report_photos.length;
            if (data.condition !== "GREEN" && damageEntryCount === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message:
                        "At least one damage report photo is required for damaged inbound items",
                    path: ["damage_report_entries"],
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
