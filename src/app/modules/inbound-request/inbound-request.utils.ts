import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../../db";
import { financialStatusEnum, inboundRequests, inboundRequestStatusEnum } from "../../../db/schema";
import { inboundRequestCostEstimateGenerator } from "../../utils/inbound-request-cost-estimate";
import { sendEmail } from "../../services/email.service";
import { emailTemplates } from "../../utils/email-templates";
import config from "../../config";

// ------------------------------------- INBOUND REQUEST ID GENERATOR ---------------------------
// FORMAT: IR-YYYYMMDD-XXX
export const inboundRequestIdGenerator = async (platformId: string): Promise<string> => {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0].replace(/-/g, ""); // YYYYMMDD

    // Find highest sequence number for today
    const prefix = `IR-${dateStr}-`;
    const todayRequest = await db
        .select({ inbound_request_id: inboundRequests.inbound_request_id })
        .from(inboundRequests)
        .where(
            and(
                eq(inboundRequests.platform_id, platformId),
                sql`${inboundRequests.inbound_request_id} LIKE ${prefix + "%"}`
            )
        )
        .orderBy(desc(inboundRequests.inbound_request_id))
        .limit(1);

    let sequence = 1;
    if (todayRequest.length > 0) {
        const lastRequestId = todayRequest[0].inbound_request_id;
        const lastSequence = parseInt(lastRequestId.split("-")[2], 10);
        sequence = lastSequence + 1;
    }

    const sequenceStr = sequence.toString().padStart(3, "0");
    return `${prefix}${sequenceStr}`;
};

export const inboundRequestSortableFields: Record<string, any> = {
    incoming_at: inboundRequests.incoming_at,
    created_at: inboundRequests.created_at,
    request_status: inboundRequests.request_status,
    financial_status: inboundRequests.financial_status,
};

export const inboundRequestQueryValidationConfig = {
    sort_by: Object.keys(inboundRequestSortableFields),
    sort_order: ["asc", "desc"],
    request_status: inboundRequestStatusEnum.enumValues,
    financial_status: financialStatusEnum.enumValues,
};

// ------------------------------------- GENERATE COST ESTIMATE AND SEND EMAIL ------------------
type GenerateCostEstimateAndSendEmailPayload = {
    request_id: string;
    platform_id: string;
    email: string;
    inbound_request_id: string;
    company_name: string;
    final_total_price: string;
    regenarate?: boolean;
}

export const generateCostEstimateAndSendEmail = async (payload: GenerateCostEstimateAndSendEmailPayload) => {
    const { request_id, platform_id, email, inbound_request_id, company_name, final_total_price, regenarate = false } = payload;

    // Step 4: Generate cost estimate PDF
    const { pdf_buffer } = await inboundRequestCostEstimateGenerator(request_id, platform_id, regenarate);

    // Step 5: Send email to requester
    await sendEmail({
        to: email,
        subject: `${regenarate ? "Regenerated" : "Cost Estimate"} for Inbound Request ${inbound_request_id}`,
        html: emailTemplates.send_ir_cost_estimate_to_client({
            inbound_request_id: inbound_request_id,
            company_name: company_name,
            final_total_price: String(final_total_price),
            download_estimate_url: `${config.server_url}/client/v1/invoice/download-ir-cost-estimate-pdf/${inbound_request_id}?pid=${platform_id}`,
        }),
        attachments: pdf_buffer
            ? [
                {
                    filename: `${inbound_request_id}.pdf`,
                    content: pdf_buffer,
                },
            ]
            : undefined,
    });
}
