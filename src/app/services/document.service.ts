import httpStatus from "http-status";
import CustomizedError from "../error/customized-error";
import { AuthUser } from "../interface/common";
import {
    getCommercialDocumentContext,
    buildCommercialDocumentPdfPayload,
    buildCostEstimateS3Key,
    CommercialDocumentContextType,
} from "../utils/commercial-documents";
import { renderCostEstimatePDF } from "../utils/cost-estimate-pdf";
import { checkFileExists, deleteFileFromS3, uploadPDFToS3 } from "./s3.service";

const ALLOWED_ORDER_COST_ESTIMATE_STATUSES = new Set(["PENDING_APPROVAL", "QUOTED"]);

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
            options?.generatedByUserId,
            { respectClientLineVisibility: true }
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
        _entityType: CommercialDocumentContextType,
        _entityId: string,
        _platformId: string,
        _options: InvoiceOptions
    ): Promise<{ invoice_id: string; invoice_pdf_url: string; pdf_buffer: Buffer }> {
        throw new CustomizedError(
            httpStatus.NOT_IMPLEMENTED,
            "Invoicing is disabled in this pre-alpha branch. Endpoints are reserved as stubs."
        );
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
