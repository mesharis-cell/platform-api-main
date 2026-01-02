import { and, desc, eq, isNotNull, sql } from "drizzle-orm"
import { db } from "../../db"
import { invoices } from "../../db/schema"
import { renderInvoicePDF } from "./invoice-pdf"
import { deleteFileFromS3, uploadPDFToS3 } from "../services/s3.service"

// --------------------------------- INVOICE NUMBER GENERATOR ---------------------------------
// FORMAT: INV-YYYYMMDD-###
export const invoiceNumberGenerator = async (platformId: string): Promise<string> => {
    const today = new Date()
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '') // YYYYMMDD

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
        .limit(1)

    if (result.length === 0) {
        return `INV-${dateStr}-001`
    }

    const lastNumber = result[0].invoice_id!
    const sequence = parseInt(lastNumber.split('-')[2]) + 1
    const paddedSequence = sequence.toString().padStart(3, '0')

    return `INV-${dateStr}-${paddedSequence}`
}

// --------------------------------- INVOICE GENERATOR ----------------------------------------
export const invoiceGenerator = async (data: InvoicePayload, regenerate: boolean = false) => {

    const [invoice] = await db.select().from(invoices).where(
        and(eq(invoices.order_id, data.order_id), eq(invoices.platform_id, data.platform_id))
    );

    if (invoice && !regenerate) {
        throw new Error(
            'Invoice already exists for this order. Use regenerate flag to create new invoice.'
        )
    }

    // Prevent regeneration after payment confirmed
    if (regenerate && invoice?.invoice_paid_at) {
        throw new Error(
            'Cannot regenerate invoice after payment has been confirmed'
        )
    }

    // Generate or reuse invoice number
    let invoiceNumber: string
    if (regenerate && invoice?.invoice_id) {
        if (invoice.invoice_pdf_url) {
            await deleteFileFromS3(invoice.invoice_pdf_url)
        }
        invoiceNumber = invoice.invoice_id
    } else {
        invoiceNumber = await invoiceNumberGenerator(data.platform_id)
    }

    // Generate PDF
    const pdfBuffer = await renderInvoicePDF({ ...data, invoice_number: invoiceNumber, invoice_date: new Date() })

    // Upload PDF to S3
    const key = `invoices/${data.company_name}/${invoiceNumber}.pdf`
    const pdfUrl = await uploadPDFToS3(pdfBuffer, invoiceNumber, key)

    // Save or update invoice record
    if (regenerate && invoice) {
        await db
            .update(invoices)
            .set({
                invoice_pdf_url: pdfUrl,
                updated_at: new Date(),
            })
            .where(and(eq(invoices.id, invoice.id), eq(invoices.platform_id, data.platform_id)))
    } else {
        await db.insert(invoices).values({
            platform_id: data.platform_id,
            order_id: data.order_id,
            invoice_id: invoiceNumber,
            invoice_pdf_url: pdfUrl,
        })
    }

    return {
        invoice_id: invoiceNumber,
        invoice_pdf_url: pdfUrl,
    }
}

// --------------------------------- TYPES ----------------------------------------------------
export type HandlingTag =
    | 'Fragile'
    | 'HighValue'
    | 'HeavyLift'
    | 'AssemblyRequired'

export type InvoicePayload = {
    order_id: string;
    platform_id: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    company_name: string;
    event_start_date: Date;
    event_end_date: Date;
    venue_name: string;
    venue_country: string;
    venue_city: string;
    venue_address: string;
    items: Array<{ asset_name: string, quantity: number, handling_tags: HandlingTag[], from_collection_name?: string }>;
    pricing: {
        logistics_base_price: string;
        platform_margin_percent: string;
        platform_margin_amount: string;
        final_total_price: string;
        show_breakdown: boolean;
    };
}