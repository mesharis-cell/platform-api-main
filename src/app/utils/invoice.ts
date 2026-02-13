import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { companies, invoices, orders } from "../../db/schema";
import { deleteFileFromS3, uploadPDFToS3 } from "../services/s3.service";
import { renderInvoicePDF } from "./invoice-pdf";
import CustomizedError from "../error/customized-error";
import httpStatus from "http-status";
import { AuthUser } from "../interface/common";
import { applyMarginPerLine, calculatePricingSummary, roundCurrency } from "./pricing-engine";

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

// --------------------------------- INVOICE GENERATOR ----------------------------------------
export const invoiceGenerator = async (
    orderId: string,
    platformId: string,
    regenerate: boolean = false,
    user: AuthUser
): Promise<{ invoice_id: string; invoice_pdf_url: string; pdf_buffer: Buffer }> => {
    const [invoice] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.order_id, orderId), eq(invoices.platform_id, platformId)));

    if (invoice && !regenerate) {
        throw new Error(
            "Invoice already exists for this order. Use regenerate flag to create new invoice."
        );
    }

    // Prevent regeneration after payment confirmed
    if (regenerate && invoice && invoice.invoice_paid_at) {
        throw new Error("Cannot regenerate invoice after payment has been confirmed");
    }

    // Generate or reuse invoice number
    let invoiceNumber: string;
    if (regenerate && invoice?.invoice_id) {
        if (invoice.invoice_pdf_url) {
            await deleteFileFromS3(invoice.invoice_pdf_url);
        }
        invoiceNumber = invoice.invoice_id;
    } else {
        invoiceNumber = await invoiceNumberGenerator(platformId);
    }
    // ... (existing code)

    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: true,
            order_pricing: true,
            venue_city: true,
            items: {
                with: {
                    asset: {
                        columns: {
                            id: true,
                            name: true,
                            refurb_days_estimate: true,
                            available_quantity: true,
                        },
                    },
                },
            },
            line_items: true,
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found to generate invoice");
    }

    const company = order.company as typeof companies.$inferSelect | null;
    const venueLocation = order.venue_location as any;
    const pricing = order.order_pricing;
    const orderLineItems = order.line_items;

    const baseOpsTotal = Number(pricing.base_ops_total);
    const transportRate = Number((pricing.transport as any).final_rate);
    const catalogAmount = Number((pricing.line_items as any).catalog_total);
    const customTotal = Number((pricing.line_items as any).custom_total);
    const marginPercent = Number((pricing.margin as any).percent);
    const pricingSummary = calculatePricingSummary({
        base_ops_total: baseOpsTotal,
        transport_rate: transportRate,
        catalog_total: catalogAmount,
        custom_total: customTotal,
        margin_percent: marginPercent,
    });

    const calculatedOrderLineItems = orderLineItems.map((item) => {
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
    const lineItemsSubTotal = calculatedOrderLineItems.reduce(
        (sum, item) => sum + Number(item.total),
        0
    );

    const invoiceData = {
        id: order.id,
        user_id: user.id,
        platform_id: order.platform_id,
        order_id: order.order_id,
        contact_name: order.contact_name,
        contact_email: order.contact_email,
        contact_phone: order.contact_phone,
        company_name: company?.name || "N/A",
        event_start_date: order.event_start_date,
        event_end_date: order.event_end_date,
        venue_name: order.venue_name,
        venue_country: venueLocation.country || "N/A",
        venue_city: order.venue_city?.name || "N/A",
        venue_address: venueLocation.address || "N/A",
        order_status: order.order_status,
        financial_status: order.financial_status,
        pricing: {
            logistics_base_price: pricingSummary.sell_lines.base_ops_total.toFixed(2),
            transport_rate: pricingSummary.sell_lines.transport_total.toFixed(2),
            service_fee: pricingSummary.service_fee.toFixed(2),
            final_total_price: pricingSummary.final_total.toFixed(2),
            show_breakdown: !!pricing,
        },
        items: order.items.map((item) => ({
            asset_name: item.asset.name,
            quantity: item.quantity,
            handling_tags: item.handling_tags as any,
            from_collection_name: item.from_collection_name || "N/A",
        })),
        line_items: calculatedOrderLineItems,
        line_items_sub_total: lineItemsSubTotal,
    };

    // Generate PDF
    const pdfBuffer = await renderInvoicePDF({
        ...invoiceData,
        invoice_number: invoiceNumber,
        invoice_date: new Date(),
    });

    // Upload PDF to S3
    const key = `invoices/${company?.name.replace(/\s/g, "-").toLowerCase()}/${invoiceNumber}.pdf`;
    const pdfUrl = await uploadPDFToS3(pdfBuffer, invoiceNumber, key);

    // Save or update invoice record (wrapped in transaction)
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
        // Create invoice and update order
        await db.transaction(async (tx) => {
            // Insert invoice
            await tx.insert(invoices).values({
                platform_id: platformId,
                generated_by: user.id,
                order_id: orderId,
                type: "ORDER",
                invoice_id: invoiceNumber,
                invoice_pdf_url: pdfUrl,
            });

            // Update order financial status
            await tx
                .update(orders)
                .set({
                    financial_status: "PENDING_INVOICE",
                    updated_at: new Date(),
                })
                .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)));
        });
    }

    return {
        invoice_id: invoiceNumber,
        invoice_pdf_url: pdfUrl,
        pdf_buffer: pdfBuffer,
    };
};

// --------------------------------- TYPES ----------------------------------------------------
export type HandlingTag = "Fragile" | "HighValue" | "HeavyLift" | "AssemblyRequired";

export type InvoicePayload = {
    id: string;
    user_id: string;
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
    order_status: string;
    financial_status: string;
    items: Array<{
        asset_name: string;
        quantity: number;
        handling_tags: HandlingTag[];
        from_collection_name?: string;
    }>;
    pricing: {
        transport_rate: string;
        service_fee: string;
        logistics_base_price: string;
        final_total_price: string;
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
