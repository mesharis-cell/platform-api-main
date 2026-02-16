import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { invoices, orders } from "../../db/schema";
import { deleteFileFromS3, uploadPDFToS3 } from "../services/s3.service";
import { renderInvoicePDF } from "./invoice-pdf";
import CustomizedError from "../error/customized-error";
import httpStatus from "http-status";
import { AuthUser } from "../interface/common";
import {
    buildCommercialDocumentPdfPayload,
    buildInvoiceS3Key,
    CommercialDocumentContextType,
    CommercialDocumentPdfPayload,
    getCommercialDocumentContext,
} from "./commercial-documents";

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

const getExistingInvoiceForContext = async (
    contextType: CommercialDocumentContextType,
    contextId: string,
    platformId: string
) => {
    if (contextType === "ORDER") {
        const [invoice] = await db
            .select()
            .from(invoices)
            .where(and(eq(invoices.order_id, contextId), eq(invoices.platform_id, platformId)));
        return invoice;
    }

    const [invoice] = await db
        .select()
        .from(invoices)
        .where(
            and(eq(invoices.service_request_id, contextId), eq(invoices.platform_id, platformId))
        );
    return invoice;
};

const generateInvoiceForContext = async (
    contextType: CommercialDocumentContextType,
    contextId: string,
    platformId: string,
    regenerate: boolean,
    user: AuthUser
): Promise<{ invoice_id: string; invoice_pdf_url: string; pdf_buffer: Buffer }> => {
    const existingInvoice = await getExistingInvoiceForContext(contextType, contextId, platformId);
    const label = contextType === "ORDER" ? "order" : "service request";

    if (existingInvoice && !regenerate) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Invoice already exists for this ${label}. Use regenerate=true to rebuild PDF.`
        );
    }
    if (regenerate && existingInvoice?.invoice_paid_at) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Cannot regenerate invoice after payment has been confirmed"
        );
    }

    const invoiceNumber =
        regenerate && existingInvoice?.invoice_id
            ? existingInvoice.invoice_id
            : await invoiceNumberGenerator(platformId);

    if (regenerate && existingInvoice?.invoice_pdf_url) {
        await deleteFileFromS3(existingInvoice.invoice_pdf_url);
    }

    const context = await getCommercialDocumentContext(contextType, contextId, platformId);
    const invoiceData: CommercialDocumentPdfPayload = buildCommercialDocumentPdfPayload(
        context,
        "SELL_SIDE",
        user.id
    );

    const pdfBuffer = await renderInvoicePDF({
        ...invoiceData,
        invoice_number: invoiceNumber,
        invoice_date: new Date(),
    });
    const s3Key = buildInvoiceS3Key(context, invoiceNumber);
    const pdfUrl = await uploadPDFToS3(pdfBuffer, invoiceNumber, s3Key);

    if (regenerate && existingInvoice) {
        await db
            .update(invoices)
            .set({
                invoice_pdf_url: pdfUrl,
                updated_at: new Date(),
                updated_by: user.id,
            })
            .where(and(eq(invoices.id, existingInvoice.id), eq(invoices.platform_id, platformId)));

        return {
            invoice_id: invoiceNumber,
            invoice_pdf_url: pdfUrl,
            pdf_buffer: pdfBuffer,
        };
    }

    if (contextType === "ORDER") {
        await db.transaction(async (tx) => {
            await tx.insert(invoices).values({
                platform_id: platformId,
                generated_by: user.id,
                order_id: contextId,
                type: "ORDER",
                invoice_id: invoiceNumber,
                invoice_pdf_url: pdfUrl,
            });

            await tx
                .update(orders)
                .set({
                    financial_status: "INVOICED",
                    updated_at: new Date(),
                })
                .where(and(eq(orders.id, contextId), eq(orders.platform_id, platformId)));
        });
    } else {
        await db.insert(invoices).values({
            platform_id: platformId,
            generated_by: user.id,
            service_request_id: contextId,
            type: "SERVICE_REQUEST",
            invoice_id: invoiceNumber,
            invoice_pdf_url: pdfUrl,
        });
    }

    return {
        invoice_id: invoiceNumber,
        invoice_pdf_url: pdfUrl,
        pdf_buffer: pdfBuffer,
    };
};

export const invoiceGenerator = async (
    orderId: string,
    platformId: string,
    regenerate: boolean = false,
    user: AuthUser
) => generateInvoiceForContext("ORDER", orderId, platformId, regenerate, user);

export const serviceRequestInvoiceGenerator = async (
    serviceRequestId: string,
    platformId: string,
    regenerate: boolean,
    user: AuthUser
) => generateInvoiceForContext("SERVICE_REQUEST", serviceRequestId, platformId, regenerate, user);

export type HandlingTag = "Fragile" | "HighValue" | "HeavyLift" | "AssemblyRequired";
export type InvoicePayload = CommercialDocumentPdfPayload;
