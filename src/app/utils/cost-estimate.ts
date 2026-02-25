import httpStatus from "http-status";
import { checkFileExists, deleteFileFromS3, uploadPDFToS3 } from "../services/s3.service";
import CustomizedError from "../error/customized-error";
import { AuthUser } from "../interface/common";
import { renderCostEstimatePDF } from "./cost-estimate-pdf";
import {
    buildCommercialDocumentPdfPayload,
    buildCostEstimateS3Key,
    CommercialDocumentContextType,
    getCommercialDocumentContext,
} from "./commercial-documents";

const ALLOWED_ORDER_COST_ESTIMATE_STATUSES = new Set(["PENDING_APPROVAL", "QUOTED"]);

export const generateCommercialCostEstimate = async (
    contextType: CommercialDocumentContextType,
    contextId: string,
    platformId: string,
    regenerate: boolean = false,
    generatedByUserId?: string
): Promise<{ estimate_pdf_url: string; pdf_buffer: Buffer }> => {
    const context = await getCommercialDocumentContext(contextType, contextId, platformId);

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

    if (!regenerate) {
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

    const estimateData = buildCommercialDocumentPdfPayload(context, "SELL_SIDE", generatedByUserId);
    const pdfBuffer = await renderCostEstimatePDF({
        ...estimateData,
        estimate_date: new Date(),
    });
    const pdfUrl = await uploadPDFToS3(pdfBuffer, context.reference_id, key);

    return {
        estimate_pdf_url: pdfUrl,
        pdf_buffer: pdfBuffer,
    };
};

export const costEstimateGenerator = async (
    orderId: string,
    platformId: string,
    user: AuthUser,
    regenerate: boolean = false
) => generateCommercialCostEstimate("ORDER", orderId, platformId, regenerate, user.id);
