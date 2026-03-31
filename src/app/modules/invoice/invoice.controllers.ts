import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import { getPDFBufferFromS3 } from "../../services/s3.service";
import { db } from "../../../db";
import { companies, inboundRequests, orders, serviceRequests } from "../../../db/schema";
import { and, eq } from "drizzle-orm";
import CustomizedError from "../../error/customized-error";
import { getRequiredString } from "../../utils/request";
import { DocumentService } from "../../services/document.service";

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

const assertClientOrderOwnership = (
    user: any,
    order: { company_id: string | null | undefined; created_by: string | null | undefined }
) => {
    if (user?.role !== "CLIENT") return;
    if (!user.company_id || user.company_id !== order.company_id || user.id !== order.created_by) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "You do not have access to this order");
    }
};

const isUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const throwInvoiceStubError = () => {
    throw new CustomizedError(
        httpStatus.NOT_IMPLEMENTED,
        "Invoicing is disabled in this pre-alpha branch. Endpoints are reserved as stubs."
    );
};

// ----------------------------------- GET INVOICE BY ID --------------------------------------
const getInvoiceById = catchAsync(async (req, res) => {
    throwInvoiceStubError();
});

// ----------------------------------- DOWNLOAD INVOICE (PRESIGNED URL) -----------------------
const downloadInvoice = catchAsync(async (req, res) => {
    throwInvoiceStubError();
});

// ----------------------------------- DOWNLOAD INVOICE PDF (DIRECT) --------------------------
const downloadInvoicePDF = catchAsync(async (req, res) => {
    throwInvoiceStubError();
});

// ----------------------------------- GET INVOICES -------------------------------------------
const getInvoices = catchAsync(async (req, res) => {
    throwInvoiceStubError();
});

// ----------------------------------- CONFIRM PAYMENT ----------------------------------------
const confirmPayment = catchAsync(async (req, res) => {
    throwInvoiceStubError();
});

// ----------------------------------- GENERATE INVOICE ---------------------------------------
const generateInvoice = catchAsync(async (req, res) => {
    throwInvoiceStubError();
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
    assertClientOrderOwnership(user, order);

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
        await DocumentService.regenerateEstimate("SERVICE_REQUEST", serviceRequest.id, platformId);
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
