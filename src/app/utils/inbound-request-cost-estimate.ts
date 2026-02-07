import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { inboundRequests } from "../../db/schema";
import { uploadPDFToS3 } from "../services/s3.service";
import httpStatus from "http-status";
import CustomizedError from "../error/customized-error";
import { renderInboundRequestCostEstimatePDF } from "./inbound-request-cost-estimate-pdf";

// --------------------------------- INBOUND REQUEST COST ESTIMATE GENERATOR ------------------------
export const inboundRequestCostEstimateGenerator = async (
    requestId: string,
    platformId: string,
): Promise<{ estimate_pdf_url: string; pdf_buffer: Buffer }> => {

    // Step 1: Fetch Inbound Request Data
    const inboundRequest = await db.query.inboundRequests.findFirst({
        where: and(eq(inboundRequests.id, requestId), eq(inboundRequests.platform_id, platformId)),
        with: {
            company: true,
            request_pricing: true,
            items: true,
            requester: true,
        },
    });

    if (!inboundRequest) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request not found to generate cost estimate");
    }

    const company = inboundRequest.company;
    const pricing = inboundRequest.request_pricing;

    if (!pricing) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Pricing details are missing for this inbound request");
    }

    const baseOpsTotal = Number(pricing.base_ops_total);
    const catalogAmount = Number((pricing.line_items as any).catalog_total);
    const customTotal = Number((pricing.line_items as any).custom_total);
    const marginPercent = Number((pricing.margin as any).percent);
    const logisticsSubTotal = baseOpsTotal + (baseOpsTotal * (marginPercent / 100));
    const catalogTotal = catalogAmount + (catalogAmount * (marginPercent / 100));
    const serviceFee = catalogTotal + customTotal;
    const total = logisticsSubTotal + serviceFee;

    const estimateData: InboundRequestCostEstimatePayload = {
        inbound_request_id: inboundRequest.inbound_request_id,
        estimate_number: inboundRequest.id,
        company_name: company?.name || "N/A",
        contact_name: inboundRequest.requester?.name || "N/A",
        contact_email: inboundRequest.requester?.email || company?.contact_email || "N/A",
        contact_phone: company?.contact_phone || "N/A",
        incoming_at: inboundRequest.incoming_at,
        note: inboundRequest.note || "",
        items: inboundRequest.items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            category: item.category
        })),
        pricing: {
            logistics_sub_total: String(logisticsSubTotal) || '0',
            service_fee: String(serviceFee) || '0',
            final_total: String(total) || '0',
            show_breakdown: !!pricing,
        },
    };

    // Generate PDF
    const pdfBuffer = await renderInboundRequestCostEstimatePDF({
        ...estimateData,
        estimate_date: new Date(),
    });

    // Upload PDF to S3
    const key = `cost-estimates/inbound-request/${company?.name.replace(/\s/g, "-").toLowerCase()}/${inboundRequest.id}.pdf`;
    const pdfUrl = await uploadPDFToS3(pdfBuffer, inboundRequest.id, key);

    return {
        estimate_pdf_url: pdfUrl,
        pdf_buffer: pdfBuffer,
    };
};

// --------------------------------- TYPES ----------------------------------------------------
export type InboundRequestCostEstimatePayload = {
    inbound_request_id: string;
    estimate_number: string;
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
        service_fee: string;
        final_total: string;
        show_breakdown: boolean;
    };
};
