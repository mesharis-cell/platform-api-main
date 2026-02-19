import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { InvoiceServices } from "./invoice.services";
import { getPDFBufferFromS3 } from "../../services/s3.service";
import { db } from "../../../db";
import { companies, inboundRequests, orders, serviceRequests } from "../../../db/schema";
import { and, eq } from "drizzle-orm";
import CustomizedError from "../../error/customized-error";
import { getRequiredString } from "../../utils/request";
import { serviceRequestCostEstimateGenerator } from "../../utils/service-request-cost-estimate";

const resolvePlatformId = (req: any) =>
    getRequiredString(
        ((req as any).platformId as string | undefined) ||
            (req.query.pid as string | string[] | undefined),
        "pid"
    );

const assertClientEntityAccess = (
    user: any,
    companyId: string | null | undefined,
    entityLabel: string
) => {
    if (user?.role !== "CLIENT") return;
    if (!user.company_id || !companyId || user.company_id !== companyId) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            `You do not have access to this ${entityLabel}`
        );
    }
};

const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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
    const user = (req as any).user;
    const platformId = resolvePlatformId(req);
    const invoiceId = getRequiredString(req.params.invoiceId, "invoiceId");

    const invoice = await InvoiceServices.getInvoiceById(invoiceId, user, platformId);

    const buffer = await getPDFBufferFromS3(invoice.invoice_pdf_url as string);
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
    const user = (req as any).user;
    const platformId = resolvePlatformId(req);
    const orderIdParam = getRequiredString(req.params.orderId, "orderId");

    const orderLookupCondition = isUuid(orderIdParam)
        ? and(eq(orders.id, orderIdParam), eq(orders.platform_id, platformId))
        : and(eq(orders.order_id, orderIdParam), eq(orders.platform_id, platformId));

    const order = await db.query.orders.findFirst({
        where: orderLookupCondition,
        with: {
            company: true,
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }
    assertClientEntityAccess(user, order.company_id, "order");

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
    const user = (req as any).user;
    const platformId = resolvePlatformId(req);
    const requestId = getRequiredString(req.params.requestId, "requestId");

    const request = await db.query.inboundRequests.findFirst({
        where: and(
            eq(inboundRequests.inbound_request_id, requestId),
            eq(inboundRequests.platform_id, platformId)
        ),
        with: {
            company: true,
        },
    });

    if (!request) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request not found");
    }
    assertClientEntityAccess(user, request.company_id, "inbound request");

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

// ----------------------------------- DOWNLOAD SERVICE REQUEST COST ESTIMATE PDF (DIRECT) ----
const downloadServiceRequestCostEstimatePDF = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = resolvePlatformId(req);
    const requestId = getRequiredString(req.params.requestId, "requestId");

    const serviceRequest = await db.query.serviceRequests.findFirst({
        where: and(
            eq(serviceRequests.service_request_id, requestId),
            eq(serviceRequests.platform_id, platformId)
        ),
        with: {
            company: true,
        },
    });

    if (!serviceRequest) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Service request not found");
    }
    assertClientEntityAccess(user, serviceRequest.company_id, "service request");

    const company = serviceRequest.company as typeof companies.$inferSelect | null;
    const companySlug = (company?.name || "unknown-company").replace(/\s/g, "-").toLowerCase();
    const s3Key = `cost-estimates/service-request/${companySlug}/${serviceRequest.service_request_id}.pdf`;

    let buffer: Buffer;
    try {
        buffer = await getPDFBufferFromS3(s3Key);
    } catch (_) {
        await serviceRequestCostEstimateGenerator(serviceRequest.id, platformId, true);
        buffer = await getPDFBufferFromS3(s3Key);
    }

    const fileName = `cost-estimate-${serviceRequest.service_request_id}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", buffer.length);
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
    downloadServiceRequestCostEstimatePDF,
};
