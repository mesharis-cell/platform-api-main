import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { InvoiceServices } from "./invoice.services";
import { getPDFBufferFromS3 } from "../../services/s3.service";
import { db } from "../../../db";
import { companies, inboundRequests, invoices, orders } from "../../../db/schema";
import { and, eq } from "drizzle-orm";
import CustomizedError from "../../error/customized-error";
import { getRequiredString } from "../../utils/request";

// ----------------------------------- GET INVOICE BY ID --------------------------------------
const getInvoiceById = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const invoiceId = getRequiredString(req.params.invoiceId, "invoiceId");

    const result = await InvoiceServices.getInvoiceById(invoiceId, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Invoice fetched successfully",
        data: result,
    });
});

// ----------------------------------- DOWNLOAD INVOICE (PRESIGNED URL) -----------------------
const downloadInvoice = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const invoiceId = getRequiredString(req.params.invoiceId, "invoiceId");

    const result = await InvoiceServices.downloadInvoice(invoiceId, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Invoice download URL generated successfully",
        data: result,
    });
});

// ----------------------------------- DOWNLOAD INVOICE PDF (DIRECT) --------------------------
const downloadInvoicePDF = catchAsync(async (req, res) => {
    const platformId = getRequiredString(req.query.pid as string | string[] | undefined, "pid");
    const invoiceId = getRequiredString(req.params.invoiceId, "invoiceId");

    const [invoice] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.invoice_id, invoiceId), eq(invoices.platform_id, platformId)));

    if (!invoice) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    const buffer = await getPDFBufferFromS3(invoice.invoice_pdf_url);
    const fileName = `${invoice.invoice_id}.pdf`;

    // Set headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", buffer.length);

    // Send PDF buffer
    res.status(httpStatus.OK).send(buffer);
});

// ----------------------------------- GET INVOICES -------------------------------------------
const getInvoices = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await InvoiceServices.getInvoices(req.query, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Invoices fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// ----------------------------------- CONFIRM PAYMENT ----------------------------------------
const confirmPayment = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const orderId = getRequiredString(req.params.orderId, "orderId");

    const result = await InvoiceServices.confirmPayment(orderId, req.body, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Payment confirmed successfully",
        data: result,
    });
});

// ----------------------------------- GENERATE INVOICE ---------------------------------------
const generateInvoice = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await InvoiceServices.generateInvoice(platformId, user, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Invoice generated successfully",
        data: result,
    });
});

// ----------------------------------- DOWNLOAD COST ESTIMATE PDF (DIRECT) --------------------
const downloadCostEstimatePDF = catchAsync(async (req, res) => {
    const platformId = getRequiredString(req.query.pid as string | string[] | undefined, "pid");
    const orderId = getRequiredString(req.params.orderId, "orderId");

    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: true,
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    const company = order.company as typeof companies.$inferSelect | null;
    const companySlug = (company?.name || "unknown-company").replace(/\s/g, "-").toLowerCase();
    const s3Key = `cost-estimates/${companySlug}/${order.order_id}.pdf`;

    const buffer = await getPDFBufferFromS3(s3Key);
    const fileName = `cost-estimate-${order.order_id}.pdf`;

    // Set headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", buffer.length);

    // Send PDF buffer
    res.status(httpStatus.OK).send(buffer);
});

// ----------------------------------- DOWNLOAD INBOUND REQEUEST COST ESTIMATE PDF (DIRECT) ---
const downloadIRCostEstimatePDF = catchAsync(async (req, res) => {
    const platformId = getRequiredString(req.query.pid as string | string[] | undefined, "pid");
    const requestId = getRequiredString(req.params.requestId, "requestId");

    const request = await db.query.inboundRequests.findFirst({
        where: and(eq(inboundRequests.id, requestId), eq(inboundRequests.platform_id, platformId)),
        with: {
            company: true,
        },
    });

    if (!request) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request not found");
    }

    const company = request.company as typeof companies.$inferSelect | null;
    const companySlug = (company?.name || "unknown-company").replace(/\s/g, "-").toLowerCase();
    const s3Key = `cost-estimates/inbound-request/${companySlug}/${request.inbound_request_id}.pdf`;

    const buffer = await getPDFBufferFromS3(s3Key);
    const fileName = `cost-estimate-${request.inbound_request_id}.pdf`;

    // Set headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", buffer.length);

    // Send PDF buffer
    res.status(httpStatus.OK).send(buffer);
});

export const InvoiceControllers = {
    getInvoiceById,
    downloadInvoice,
    downloadInvoicePDF,
    getInvoices,
    confirmPayment,
    generateInvoice,
    downloadCostEstimatePDF,
    downloadIRCostEstimatePDF,
};
