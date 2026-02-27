import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../db";
import { invoices, orders, inboundRequests } from "../../db/schema";
import CustomizedError from "../error/customized-error";
import { AuthUser } from "../interface/common";
import {
    getCommercialDocumentContext,
    buildCommercialDocumentPdfPayload,
    buildCostEstimateS3Key,
    buildInvoiceS3Key,
    CommercialDocumentContextType,
} from "../utils/commercial-documents";
import { renderCostEstimatePDF } from "../utils/cost-estimate-pdf";
import { renderInvoicePDF } from "../utils/invoice-pdf";
import { invoiceNumberGenerator } from "../utils/invoice";
import { checkFileExists, deleteFileFromS3, uploadPDFToS3 } from "./s3.service";

const ALLOWED_ORDER_COST_ESTIMATE_STATUSES = new Set(["PENDING_APPROVAL", "QUOTED"]);

const getExistingInvoice = async (
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

    if (contextType === "INBOUND_REQUEST") {
        const [invoice] = await db
            .select()
            .from(invoices)
            .where(
                and(
                    eq(invoices.inbound_request_id, contextId),
                    eq(invoices.platform_id, platformId)
                )
            );
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

type EstimateOptions = {
    regenerate?: boolean;
    generatedByUserId?: string;
};

type InvoiceOptions = {
    user: AuthUser;
    regenerate?: boolean;
};

export const DocumentService = {
    async generateEstimate(
        entityType: CommercialDocumentContextType,
        entityId: string,
        platformId: string,
        options?: EstimateOptions
    ): Promise<{ estimate_pdf_url: string; pdf_buffer: Buffer }> {
        const context = await getCommercialDocumentContext(entityType, entityId, platformId);

        if (
            context.context_type === "ORDER" &&
            !ALLOWED_ORDER_COST_ESTIMATE_STATUSES.has(context.operational_status)
        ) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Order must be in ${Array.from(ALLOWED_ORDER_COST_ESTIMATE_STATUSES).join(" or ")} status. Current status: ${context.operational_status}`
            );
        }

        const key = buildCostEstimateS3Key(context);

        if (!options?.regenerate) {
            const exists = await checkFileExists(key);
            if (exists) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "Cost estimate already exists. Use regenerate flag to create new one."
                );
            }
        } else {
            await deleteFileFromS3(key);
        }

        const payload = buildCommercialDocumentPdfPayload(
            context,
            "SELL_SIDE",
            options?.generatedByUserId
        );
        const pdfBuffer = await renderCostEstimatePDF({ ...payload, estimate_date: new Date() });
        const pdfUrl = await uploadPDFToS3(pdfBuffer, context.reference_id, key);

        return { estimate_pdf_url: pdfUrl, pdf_buffer: pdfBuffer };
    },

    async regenerateEstimate(
        entityType: CommercialDocumentContextType,
        entityId: string,
        platformId: string
    ) {
        return this.generateEstimate(entityType, entityId, platformId, { regenerate: true });
    },

    async generateInvoice(
        entityType: CommercialDocumentContextType,
        entityId: string,
        platformId: string,
        options: InvoiceOptions
    ): Promise<{ invoice_id: string; invoice_pdf_url: string; pdf_buffer: Buffer }> {
        const { user, regenerate = false } = options;
        const existingInvoice = await getExistingInvoice(entityType, entityId, platformId);
        const label =
            entityType === "ORDER"
                ? "order"
                : entityType === "INBOUND_REQUEST"
                  ? "inbound request"
                  : "service request";

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

        const context = await getCommercialDocumentContext(entityType, entityId, platformId);
        const invoiceData = buildCommercialDocumentPdfPayload(context, "SELL_SIDE", user.id);
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
                .where(
                    and(eq(invoices.id, existingInvoice.id), eq(invoices.platform_id, platformId))
                );

            return { invoice_id: invoiceNumber, invoice_pdf_url: pdfUrl, pdf_buffer: pdfBuffer };
        }

        if (entityType === "ORDER") {
            await db.transaction(async (tx) => {
                await tx.insert(invoices).values({
                    platform_id: platformId,
                    generated_by: user.id,
                    order_id: entityId,
                    type: "ORDER",
                    invoice_id: invoiceNumber,
                    invoice_pdf_url: pdfUrl,
                });

                await tx
                    .update(orders)
                    .set({ financial_status: "INVOICED", updated_at: new Date() })
                    .where(and(eq(orders.id, entityId), eq(orders.platform_id, platformId)));
            });
        } else if (entityType === "INBOUND_REQUEST") {
            await db.transaction(async (tx) => {
                await tx.insert(invoices).values({
                    platform_id: platformId,
                    generated_by: user.id,
                    inbound_request_id: entityId,
                    type: "INBOUND_REQUEST",
                    invoice_id: invoiceNumber,
                    invoice_pdf_url: pdfUrl,
                });

                await tx
                    .update(inboundRequests)
                    .set({ financial_status: "INVOICED", updated_at: new Date() })
                    .where(
                        and(
                            eq(inboundRequests.id, entityId),
                            eq(inboundRequests.platform_id, platformId)
                        )
                    );
            });
        } else {
            await db.insert(invoices).values({
                platform_id: platformId,
                generated_by: user.id,
                service_request_id: entityId,
                type: "SERVICE_REQUEST",
                invoice_id: invoiceNumber,
                invoice_pdf_url: pdfUrl,
            });
        }

        return { invoice_id: invoiceNumber, invoice_pdf_url: pdfUrl, pdf_buffer: pdfBuffer };
    },

    async hasEstimate(
        entityType: CommercialDocumentContextType,
        entityId: string,
        platformId: string
    ): Promise<boolean> {
        const context = await getCommercialDocumentContext(entityType, entityId, platformId);
        const key = buildCostEstimateS3Key(context);
        return checkFileExists(key);
    },

    async getEstimateUrl(
        entityType: CommercialDocumentContextType,
        entityId: string,
        platformId: string
    ): Promise<string> {
        const context = await getCommercialDocumentContext(entityType, entityId, platformId);
        return buildCostEstimateS3Key(context);
    },
};
