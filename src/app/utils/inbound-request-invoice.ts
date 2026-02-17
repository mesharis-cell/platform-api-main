import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { inboundRequests, invoices } from "../../db/schema";
import { deleteFileFromS3, uploadPDFToS3 } from "../services/s3.service";
import httpStatus from "http-status";
import { AuthUser } from "../interface/common";
import { invoiceNumberGenerator } from "./invoice";
import { renderInboundRequestInvoicePDF } from "./inbound-request-invoice-pdf";
import CustomizedError from "../error/customized-error";
import { applyMarginPerLine, calculatePricingSummary, roundCurrency } from "./pricing-engine";

// --------------------------------- INBOUND REQUEST INVOICE GENERATOR ------------------------
export const inboundRequestInvoiceGenerator = async (
    requestId: string,
    platformId: string,
    user: AuthUser,
    regenerate: boolean = false
): Promise<{ invoice_id: string; invoice_pdf_url: string; pdf_buffer: Buffer }> => {
    // Step 1: Check if invoice already exists
    const [invoice] = await db
        .select()
        .from(invoices)
        .where(
            and(eq(invoices.inbound_request_id, requestId), eq(invoices.platform_id, platformId))
        );

    if (invoice && !regenerate) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Invoice already exists for this inbound request. Use regenerate flag to create new invoice."
        );
    }

    // Step 2: Prevent regeneration after payment confirmed
    if (regenerate && invoice && invoice.invoice_paid_at) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Cannot regenerate invoice after payment has been confirmed"
        );
    }

    // Step 3: Generate or reuse invoice number
    let invoiceNumber: string;
    if (regenerate && invoice?.invoice_id) {
        if (invoice.invoice_pdf_url) {
            await deleteFileFromS3(invoice.invoice_pdf_url);
        }
        invoiceNumber = invoice.invoice_id;
    } else {
        invoiceNumber = await invoiceNumberGenerator(platformId);
    }

    // Step 4: Fetch Inbound Request Data
    const inboundRequest = await db.query.inboundRequests.findFirst({
        where: and(eq(inboundRequests.id, requestId), eq(inboundRequests.platform_id, platformId)),
        with: {
            company: true,
            request_pricing: true,
            items: true,
            requester: true,
            line_items: true,
        },
    });

    if (!inboundRequest) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Inbound request not found to generate invoice"
        );
    }

    const company = inboundRequest.company;
    const pricing = inboundRequest.request_pricing;
    const requestLineItems = inboundRequest.line_items;

    if (!pricing) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Pricing details are missing for this inbound request"
        );
    }

    const baseOpsTotal = Number(pricing.base_ops_total);
    const catalogAmount = Number((pricing.line_items as any).catalog_total);
    const customTotal = Number((pricing.line_items as any).custom_total);
    const marginPercent = Number((pricing.margin as any).percent);
    const pricingSummary = calculatePricingSummary({
        base_ops_total: baseOpsTotal,
        catalog_total: catalogAmount,
        custom_total: customTotal,
        margin_percent: marginPercent,
    });

    const calculatedLineItems = requestLineItems.map((item) => {
        const quantity = item.quantity ? Number(item.quantity) : 0;
        const sellTotal = applyMarginPerLine(Number(item.total || 0), marginPercent);
        const unit_rate = quantity > 0 ? roundCurrency(sellTotal / quantity) : 0;

        return {
            line_item_id: item.line_item_id,
            description: item.description,
            quantity,
            unit_rate,
            total: sellTotal,
        };
    });

    // Calculate line items subtotal
    const lineItemsSubTotal = calculatedLineItems.reduce(
        (sum, item) => sum + Number(item.total),
        0
    );

    const invoiceData: InboundRequestInvoicePayload = {
        inbound_request_id: inboundRequest.inbound_request_id,
        invoice_number: invoiceNumber,
        company_name: company?.name || "N/A",
        contact_name: inboundRequest.requester?.name || "N/A",
        contact_email: inboundRequest.requester?.email || company?.contact_email || "N/A",
        contact_phone: company?.contact_phone || "N/A",
        incoming_at: inboundRequest.incoming_at,
        note: inboundRequest.note || "",
        items: inboundRequest.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            category: item.category,
        })),
        pricing: {
            logistics_sub_total: pricingSummary.sell_lines.base_ops_total.toFixed(2),
            catalog_total: pricingSummary.sell_lines.catalog_total.toFixed(2),
            custom_total: pricingSummary.sell_lines.custom_total.toFixed(2),
            service_fee: pricingSummary.service_fee.toFixed(2),
            final_total: pricingSummary.final_total.toFixed(2),
            show_breakdown: !!pricing,
        },
        line_items: calculatedLineItems,
        line_items_sub_total: lineItemsSubTotal,
    };

    // Generate PDF
    const pdfBuffer = await renderInboundRequestInvoicePDF({
        ...invoiceData,
        invoice_number: invoiceNumber, // Redundant but required by type intersection
        invoice_date: new Date(),
    });

    // Upload PDF to S3
    const key = `invoices/inbound-request/${company?.name.replace(/\s/g, "-").toLowerCase()}/${invoiceNumber}.pdf`;
    const pdfUrl = await uploadPDFToS3(pdfBuffer, invoiceNumber, key);

    // Save or update invoice record
    if (regenerate && invoice) {
        await db
            .update(invoices)
            .set({
                invoice_pdf_url: pdfUrl,
                updated_at: new Date(),
                updated_by: user.id,
            })
            .where(and(eq(invoices.id, invoice.id), eq(invoices.platform_id, platformId)));
    } else {
        // Create invoice and update inbound request
        await db.transaction(async (tx) => {
            // Insert invoice
            await tx.insert(invoices).values({
                platform_id: platformId,
                generated_by: user.id,
                inbound_request_id: requestId,
                type: "INBOUND_REQUEST",
                invoice_id: invoiceNumber,
                invoice_pdf_url: pdfUrl,
            });

            // Update inbound request financial status
            await tx
                .update(inboundRequests)
                .set({
                    financial_status: "INVOICED",
                    updated_at: new Date(),
                })
                .where(
                    and(
                        eq(inboundRequests.id, requestId),
                        eq(inboundRequests.platform_id, platformId)
                    )
                );
        });
    }

    return {
        invoice_id: invoiceNumber,
        invoice_pdf_url: pdfUrl,
        pdf_buffer: pdfBuffer,
    };
};

// --------------------------------- TYPES ----------------------------------------------------
export type InboundRequestInvoicePayload = {
    inbound_request_id: string;
    invoice_number: string;
    company_name: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    incoming_at: Date;
    note: string;
    items: Array<{
        name: string;
        quantity: number;
        category: string;
    }>;
    pricing: {
        logistics_sub_total: string;
        catalog_total: string;
        custom_total: string;
        service_fee: string;
        final_total: string;
        show_breakdown: boolean;
    };
    line_items: Array<{
        line_item_id: string;
        description: string;
        quantity: number;
        unit_rate: number;
        total: number;
    }>;
    line_items_sub_total: number;
};
