import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, inboundRequestItems, inboundRequests } from "../../../db/schema";
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
        // Create request
        const [request] = await tx
            .insert(inboundRequests)
            .values({
                platform_id: platformId,
                company_id: companyId,
                requester_id: user.id,
                incoming_at: new Date(data.incoming_at),
                note: data.note
            })
            .returning();

        // Create items
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

        if (itemsToInsert.length > 0) {
            await tx.insert(inboundRequestItems).values(itemsToInsert);
        }

        return request;
    });
};

export const InboundRequestServices = {
    createInboundRequest,
};
