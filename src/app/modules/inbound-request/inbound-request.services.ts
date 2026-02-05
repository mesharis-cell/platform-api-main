import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, inboundRequestItems, inboundRequests, prices, users } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { eq, isNull, and, asc, count, desc, gte, ilike, lte, or } from "drizzle-orm";
import { InboundRequestPayload } from "./inbound-request.interfaces";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { inboundRequestQueryValidationConfig, inboundRequestSortableFields } from "./inbound-request.utils";

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
            images: item.images || []
        }));

        // Step 2.7: Bulk insert items
        if (itemsToInsert.length > 0) {
            await tx.insert(inboundRequestItems).values(itemsToInsert);
        }

        return request;
    });
};

const getInboundRequests = async (query: Record<string, any>, user: AuthUser, platformId: string) => {
    const {
        search_term,
        page,
        limit,
        sort_by,
        sort_order,
        company_id,
        request_status,
        financial_status,
        date_from,
        date_to,
    } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(inboundRequestQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(inboundRequestQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } = paginationMaker({
        page,
        limit,
        sort_by,
        sort_order,
    });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(inboundRequests.platform_id, platformId)];

    // Step 3a: Filter by user role (CLIENT users see only their company's requests)
    if (user.role === "CLIENT") {
        if (user.company_id) {
            conditions.push(eq(inboundRequests.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3b: Optional filters
    if (user.role !== "CLIENT" && company_id) {
        conditions.push(eq(inboundRequests.company_id, company_id));
    }

    if (request_status) {
        queryValidator(inboundRequestQueryValidationConfig, "request_status", request_status);
        conditions.push(eq(inboundRequests.request_status, request_status));
    }

    if (financial_status) {
        queryValidator(inboundRequestQueryValidationConfig, "financial_status", financial_status);
        conditions.push(eq(inboundRequests.financial_status, financial_status));
    }

    if (date_from) {
        const fromDate = new Date(date_from);
        if (isNaN(fromDate.getTime())) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date_from format");
        }
        conditions.push(gte(inboundRequests.created_at, fromDate));
    }

    if (date_to) {
        const toDate = new Date(date_to);
        if (isNaN(toDate.getTime())) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date_to format");
        }
        conditions.push(lte(inboundRequests.created_at, toDate));
    }

    // Step 3c: Search functionality
    if (search_term) {
        const searchConditions = [
            ilike(inboundRequests.note, `%${search_term}%`),
            ilike(companies.name, `%${search_term}%`),
        ];
        conditions.push(or(...searchConditions));
    }

    // Step 4: Determine sort field
    const sortField = inboundRequestSortableFields[sortWith] || inboundRequests.created_at;

    // Step 5: Fetch requests with related information
    const results = await db
        .select({
            request: inboundRequests,
            company: {
                id: companies.id,
                name: companies.name,
            },
            requester: {
                id: users.id,
                email: users.email,
            },
            request_pricing: {
                final_total: prices.final_total,
            }
        })
        .from(inboundRequests)
        .leftJoin(companies, eq(inboundRequests.company_id, companies.id))
        .leftJoin(users, eq(inboundRequests.requester_id, users.id))
        .leftJoin(prices, eq(inboundRequests.request_pricing_id, prices.id))
        .where(and(...conditions))
        .orderBy(sortSequence === "asc" ? asc(sortField) : desc(sortField))
        .limit(limitNumber)
        .offset(skip);

    // Step 6: Get total count
    const [countResult] = await db
        .select({ count: count() })
        .from(inboundRequests)
        .leftJoin(companies, eq(inboundRequests.company_id, companies.id)) // Join needed for search filtering
        .where(and(...conditions));

    const total = countResult?.count || 0;

    return {
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total,
            total_pages: Math.ceil(total / limitNumber),
        },
        data: results,
    };
};

export const InboundRequestServices = {
    createInboundRequest,
    getInboundRequests,
};
