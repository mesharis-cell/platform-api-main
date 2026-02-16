import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../db";
import { serviceRequests } from "../../db/schema";
import CustomizedError from "../error/customized-error";
import { checkFileExists, deleteFileFromS3, uploadPDFToS3 } from "../services/s3.service";
import { renderCostEstimatePDF } from "./cost-estimate-pdf";
import { applyMarginPerLine, calculatePricingSummary, roundCurrency } from "./pricing-engine";

export const serviceRequestCostEstimateGenerator = async (
    serviceRequestId: string,
    platformId: string,
    regenerate: boolean = false
): Promise<{ estimate_pdf_url: string; pdf_buffer: Buffer }> => {
    const serviceRequest = await db.query.serviceRequests.findFirst({
        where: and(
            eq(serviceRequests.id, serviceRequestId),
            eq(serviceRequests.platform_id, platformId)
        ),
        with: {
            company: true,
            request_pricing: true,
            items: true,
            line_items: true,
        },
    });

    if (!serviceRequest) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Service request not found to generate cost estimate"
        );
    }
    if (!serviceRequest.request_pricing) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Service request pricing is missing");
    }

    const company = serviceRequest.company;
    const pricing = serviceRequest.request_pricing;
    const marginPercent = Number((pricing.margin as any)?.percent || 0);
    const baseOpsTotal = Number(pricing.base_ops_total || 0);
    const catalogAmount = Number((pricing.line_items as any)?.catalog_total || 0);
    const customTotal = Number((pricing.line_items as any)?.custom_total || 0);
    const pricingSummary = calculatePricingSummary({
        base_ops_total: baseOpsTotal,
        transport_rate: 0,
        catalog_total: catalogAmount,
        custom_total: customTotal,
        margin_percent: marginPercent,
    });

    const calculatedLineItems = serviceRequest.line_items.map((item) => {
        const quantity = item.quantity ? Number(item.quantity) : 0;
        const sellTotal = applyMarginPerLine(Number(item.total || 0), marginPercent);
        const unit_rate = quantity > 0 ? roundCurrency(sellTotal / quantity) : 0;
        return {
            line_item_id: item.line_item_id,
            description: item.description,
            quantity,
            unit_rate,
            total: sellTotal,
        };
    });

    const lineItemsSubTotal = calculatedLineItems.reduce((sum, item) => sum + Number(item.total), 0);

    const estimateData = {
        id: serviceRequest.id,
        user_id: serviceRequest.created_by,
        platform_id: serviceRequest.platform_id,
        order_id: serviceRequest.service_request_id,
        contact_name: company?.name || "Service Request",
        contact_email: company?.contact_email || "N/A",
        contact_phone: company?.contact_phone || "N/A",
        company_name: company?.name || "N/A",
        event_start_date: serviceRequest.requested_start_at || serviceRequest.created_at,
        event_end_date:
            serviceRequest.requested_due_at ||
            serviceRequest.requested_start_at ||
            serviceRequest.created_at,
        venue_name: "Service Request",
        venue_country: "N/A",
        venue_city: "N/A",
        venue_address: "N/A",
        order_status: serviceRequest.request_status,
        financial_status: serviceRequest.commercial_status,
        pricing: {
            logistics_base_price: pricingSummary.sell_lines.base_ops_total.toFixed(2),
            transport_rate: "0.00",
            service_fee: pricingSummary.service_fee.toFixed(2),
            final_total_price: pricingSummary.final_total.toFixed(2),
            show_breakdown: true,
        },
        items: serviceRequest.items.map((item) => ({
            asset_name: item.asset_name,
            quantity: item.quantity,
            handling_tags: [],
            from_collection_name: "SERVICE_REQUEST",
        })),
        line_items: calculatedLineItems,
        line_items_sub_total: lineItemsSubTotal,
    };

    const companySlug = (company?.name || "unknown-company").replace(/\s/g, "-").toLowerCase();
    const key = `cost-estimates/service-request/${companySlug}/${serviceRequest.service_request_id}.pdf`;

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

    const pdfBuffer = await renderCostEstimatePDF({
        ...estimateData,
        estimate_date: new Date(),
    });
    const pdfUrl = await uploadPDFToS3(pdfBuffer, serviceRequest.service_request_id, key);

    return {
        estimate_pdf_url: pdfUrl,
        pdf_buffer: pdfBuffer,
    };
};
