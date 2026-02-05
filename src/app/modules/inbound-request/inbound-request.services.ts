import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, inboundRequestItems, inboundRequests, prices } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { eq, isNull, and } from "drizzle-orm";
import { InboundRequestPayload } from "./inbound-request.interfaces";

const createInboundRequest = async (data: InboundRequestPayload, user: AuthUser, platformId: string) => {
    const companyId = user.company_id || data.company_id;

    if (!companyId) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Company ID is required");
    }

    // Step 1: Validate company exists and is not archived
    const [company] = await db
        .select()
        .from(companies)
        .where(and(eq(companies.id, companyId), isNull(companies.deleted_at), eq(companies.platform_id, platformId)));

    if (!company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found or is archived");
    }

    // Step 2: Create inbound request and items in a transaction
    return await db.transaction(async (tx) => {
        // Step 2.1: Calculate total volume from items
        const totalVolume = data.items.reduce((acc, item) => acc + (item.quantity * Number(item.volume_per_unit)), 0);

        // Step 2.2: Calculate logistics costs and margin
        const logisticsSubTotal = Number(company.warehouse_ops_rate) * totalVolume;
        const marginAmount = logisticsSubTotal * (Number(company.platform_margin_percent) / 100);
        const finalTotal = logisticsSubTotal + marginAmount;

        // Step 2.3: Prepare pricing details payload
        const pricingDetails = {
            platform_id: platformId,
            warehouse_ops_rate: company.warehouse_ops_rate,
            base_ops_total: logisticsSubTotal.toFixed(2),
            logistics_sub_total: logisticsSubTotal.toFixed(2),
            transport: {
                system_rate: 0,
                final_rate: 0
            },
            line_items: {
                catalog_total: 0,
                custom_total: 0,
            },
            margin: {
                percent: company.platform_margin_percent,
                amount: marginAmount,
                is_override: false,
                override_reason: null
            },
            final_total: finalTotal.toFixed(2),
            calculated_at: new Date(),
            calculated_by: user.id,
        }

        // Step 2.4: Insert pricing record
        const [price] = await tx.insert(prices).values(pricingDetails).returning();

        // Step 2.5: Insert inbound request record linked to pricing
        const [request] = await tx
            .insert(inboundRequests)
            .values({
                platform_id: platformId,
                company_id: companyId,
                requester_id: user.id,
                incoming_at: new Date(data.incoming_at),
                note: data.note,
                request_pricing_id: price.id,
            })
            .returning();

        // Step 2.6: Prepare item records
        const itemsToInsert = data.items.map((item) => ({
            inbound_request_id: request.id,
            brand_id: item.brand_id || null,
            name: item.name,
            description: item.description,
            category: item.category,
            tracking_method: item.tracking_method,
            quantity: item.quantity,
            packaging: item.packaging,
            weight_per_unit: item.weight_per_unit.toString(),
            dimensions: item.dimensions,
            volume_per_unit: item.volume_per_unit.toString(),
            handling_tags: item.handling_tags || [],
        }));

        // Step 2.7: Bulk insert items
        if (itemsToInsert.length > 0) {
            await tx.insert(inboundRequestItems).values(itemsToInsert);
        }

        return request;
    });
};

export const InboundRequestServices = {
    createInboundRequest,
};
