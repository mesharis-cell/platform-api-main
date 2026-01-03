import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { InvoiceServices } from "./invoice.services";
import { getPDFBufferFromS3 } from "../../services/s3.service";
import { db } from "../../../db";
import { invoices } from "../../../db/schema";
import { and, eq } from "drizzle-orm";
import CustomizedError from "../../error/customized-error";

// ----------------------------------- DOWNLOAD INVOICE (PRESIGNED URL) -----------------------
const downloadInvoice = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const { invoiceId } = req.params;

    const result = await InvoiceServices.downloadInvoice(
        invoiceId,
        user,
        platformId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Invoice download URL generated successfully",
        data: result,
    });
});

// ----------------------------------- DOWNLOAD INVOICE PDF (DIRECT) --------------------------
const downloadInvoicePDF = catchAsync(async (req, res) => {
    const platformId = (req.query as any).platform_id;
    const { invoiceId } = req.params;

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

    const buffer = await getPDFBufferFromS3(invoice.invoice_pdf_url);
    const fileName = `${invoice.invoice_id}.pdf`;

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);

    // Send PDF buffer
    res.status(httpStatus.OK).send(buffer);
});

// ----------------------------------- GET INVOICES -------------------------------------------
const getInvoices = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await InvoiceServices.getInvoices(
        req.query,
        user,
        platformId
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Invoices fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

export const InvoiceControllers = {
    downloadInvoice,
    downloadInvoicePDF,
    getInvoices,
};
