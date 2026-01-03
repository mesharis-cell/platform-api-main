import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { invoices, orders } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { getPresignedUrl } from "../../services/s3.service";

// ----------------------------------- GET INVOICE BY ID --------------------------------------
export const getInvoiceById = async (
    invoiceId: string,
    user: AuthUser,
    platformId: string
) => {
    // Fetch invoice
    const [invoice] = await db
        .select()
        .from(invoices)
        .where(
            and(
                eq(invoices.invoice_id, invoiceId),
                eq(invoices.platform_id, platformId)
            )
        );

    if (!invoice) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    // Access control: Only ADMIN, LOGISTICS, or the company that owns the order can access
    if (user.role === 'CLIENT') {
        // Need to check if the invoice's order belongs to the user's company
        const [order] = await db
            .select()
            .from(orders)
            .where(eq(orders.id, invoice.order_id));

        if (!order || order.company_id !== user.company_id) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "You don't have access to this invoice"
            );
        }
    }

    return invoice;
};

// ----------------------------------- DOWNLOAD INVOICE ---------------------------------------
export const downloadInvoice = async (
    invoiceId: string,
    user: AuthUser,
    platformId: string
) => {
    // Get invoice with access control
    const invoice = await getInvoiceById(invoiceId, user, platformId);

    // Generate presigned URL for download (valid for 1 hour)
    const downloadUrl = await getPresignedUrl(invoice.invoice_pdf_url, 3600);

    return {
        invoice_id: invoice.invoice_id,
        download_url: downloadUrl,
        expires_in: 3600, // seconds
    };
};

export const InvoiceServices = {
    getInvoiceById,
    downloadInvoice
};
