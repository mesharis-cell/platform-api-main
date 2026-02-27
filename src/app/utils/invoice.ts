import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { invoices } from "../../db/schema";
import { CommercialDocumentPdfPayload } from "./commercial-documents";

// --------------------------------- INVOICE NUMBER GENERATOR ---------------------------------
// FORMAT: INV-YYYYMMDD-###
export const invoiceNumberGenerator = async (platformId: string): Promise<string> => {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD

    // Find highest invoice number for today
    const result = await db
        .select({ invoice_id: invoices.invoice_id })
        .from(invoices)
        .where(
            and(
                eq(invoices.platform_id, platformId),
                sql`${invoices.invoice_id} LIKE ${`INV-${dateStr}-%`}`
            )
        )
        .orderBy(desc(invoices.invoice_id))
        .limit(1);

    if (result.length === 0) {
        return `INV-${dateStr}-001`;
    }

    const lastNumber = result[0].invoice_id!;
    const sequence = parseInt(lastNumber.split("-")[2]) + 1;
    const paddedSequence = sequence.toString().padStart(3, "0");

    return `INV-${dateStr}-${paddedSequence}`;
};

export type HandlingTag = "Fragile" | "HighValue" | "HeavyLift" | "AssemblyRequired";
export type InvoicePayload = CommercialDocumentPdfPayload;
