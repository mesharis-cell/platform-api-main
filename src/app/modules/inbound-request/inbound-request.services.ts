import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, inboundRequestItems, inboundRequests, prices, users } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { eq, isNull, and, asc, count, desc, gte, ilike, lte, or } from "drizzle-orm";
import { ApproveInboundRequestPayload, InboundRequestPayload } from "./inbound-request.interfaces";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { inboundRequestQueryValidationConfig, inboundRequestSortableFields } from "./inbound-request.utils";
import { OrderLineItemsServices } from "../order-line-items/order-line-items.services";

// ----------------------------------- CREATE INBOUND REQUEST --------------------------------
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

    const incomingAt = new Date(data.incoming_at);

    // Step 1b: Validate incoming date is at least 24 hours in the future
    const now = new Date();
    const minIncomingDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
    if (incomingAt < minIncomingDate) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Incoming date must be at least 24 hours in the future");
    }

    // Step 2: Create inbound request and items in a transaction
    return await db.transaction(async (tx) => {
        // Step 2.1: Calculate total volume from items
        const totalVolume = data.items.reduce((acc, item) => acc + ((item.quantity || 1) * Number(item.volume_per_unit)), 0);

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

// ----------------------------------- GET INBOUND REQUESTS ----------------------------------
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
                name: users.name,
                email: users.email,
            },
            request_pricing: {
                warehouse_ops_rate: prices.warehouse_ops_rate,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                final_total: prices.final_total,
                line_items: prices.line_items,
                margin: prices.margin,
                calculated_by: prices.calculated_by,
                calculated_at: prices.calculated_at,
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

    const formattedResults = results.map((result) => ({
        id: result.request.id,
        platform_id: result.request.platform_id,
        incoming_at: result.request.incoming_at,
        note: result.request.note,
        request_status: result.request.request_status,
        financial_status: result.request.financial_status,
        company: result.company,
        requester: result.requester,
        request_pricing: user.role === "CLIENT" ? {
            final_total: result.request_pricing?.final_total,
        } : result.request_pricing,
        created_at: result.request.created_at,
        updated_at: result.request.updated_at
    }));

    return {
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total,
            total_pages: Math.ceil(total / limitNumber),
        },
        data: formattedResults,
    };
};

// ----------------------------------- GET SINGLE INBOUND REQUEST -----------------------------
const getInboundRequestById = async (requestId: string, user: AuthUser, platformId: string) => {
    // Step 1: Build WHERE conditions
    const conditions: any[] = [
        eq(inboundRequests.id, requestId),
        eq(inboundRequests.platform_id, platformId)
    ];

    // Step 2: Filter by user role (CLIENT users see only their company's requests)
    if (user.role === "CLIENT") {
        if (user.company_id) {
            conditions.push(eq(inboundRequests.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3: Fetch the inbound request with related information
    const [result] = await db
        .select({
            request: inboundRequests,
            company: {
                id: companies.id,
                name: companies.name,
            },
            requester: {
                id: users.id,
                name: users.name,
                email: users.email,
            },
            request_pricing: {
                warehouse_ops_rate: prices.warehouse_ops_rate,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                final_total: prices.final_total,
                line_items: prices.line_items,
                margin: prices.margin,
                calculated_by: prices.calculated_by,
                calculated_at: prices.calculated_at,
            }
        })
        .from(inboundRequests)
        .leftJoin(companies, eq(inboundRequests.company_id, companies.id))
        .leftJoin(users, eq(inboundRequests.requester_id, users.id))
        .leftJoin(prices, eq(inboundRequests.request_pricing_id, prices.id))
        .where(and(...conditions));

    if (!result) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request not found");
    }

    // Step 4: Fetch items for this request
    const items = await db
        .select()
        .from(inboundRequestItems)
        .where(eq(inboundRequestItems.inbound_request_id, requestId));

    // Step 5: Format the response
    return {
        id: result.request.id,
        platform_id: result.request.platform_id,
        incoming_at: result.request.incoming_at,
        note: result.request.note,
        request_status: result.request.request_status,
        financial_status: result.request.financial_status,
        company: result.company,
        requester: result.requester,
        request_pricing: user.role === "CLIENT" ? {
            final_total: result.request_pricing?.final_total,
        } : result.request_pricing,
        items: items,
        created_at: result.request.created_at,
        updated_at: result.request.updated_at
    };
};

// ----------------------------------- SUBMIT FOR APPROVAL ------------------------------------
const submitForApproval = async (requestId: string, user: AuthUser, platformId: string) => {
    // Step 1: Fetch inbound request with details
    const [result] = await db
        .select({
            inbound_request: inboundRequests,
            company: {
                id: companies.id,
                name: companies.name,
                platform_margin_percent: companies.platform_margin_percent,
                warehouse_ops_rate: companies.warehouse_ops_rate,
            },
            request_pricing: {
                warehouse_ops_rate: prices.warehouse_ops_rate,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                transport: prices.transport,
                line_items: prices.line_items,
                margin: prices.margin,
                final_total: prices.final_total,
                calculated_at: prices.calculated_at,
            }
        })
        .from(inboundRequests)
        .leftJoin(companies, eq(inboundRequests.company_id, companies.id))
        .leftJoin(prices, eq(inboundRequests.request_pricing_id, prices.id))
        .where(and(eq(inboundRequests.id, requestId), eq(inboundRequests.platform_id, platformId)))
        .limit(1);

    const inboundRequest = result.inbound_request;
    const company = result.company;
    const requestPricing = result.request_pricing;

    if (!inboundRequest) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request not found");
    }
    if (!company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found for this inbound request");
    }
    if (!requestPricing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Request pricing not found for this inbound request");
    }


    // Step 2: Verify inbound request is in PRICING_REVIEW status
    if (inboundRequest.request_status !== "PRICING_REVIEW") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Inbound request is not in PRICING_REVIEW status. Current status: ${inboundRequest.request_status}`
        );
    }

    // Step 3: Get line items totals
    const lineItemsTotals = await OrderLineItemsServices.calculateInboundRequestLineItemsTotals(
        inboundRequest.id,
        platformId
    );

    // Step 4: Fetch items for this request
    const items = await db
        .select()
        .from(inboundRequestItems)
        .where(eq(inboundRequestItems.inbound_request_id, requestId));

    // Step 3.1: Calculate total volume from items
    const totalVolume = items.reduce((acc, item) => acc + ((item.quantity || 1) * Number(item.volume_per_unit)), 0);

    // Step 5: Calculate new pricing
    const marginOverride = !!(requestPricing?.margin as any)?.is_override;
    const marginPercent = marginOverride
        ? parseFloat((requestPricing.margin as any).percent)
        : parseFloat(company.platform_margin_percent);
    const marginOverrideReason = marginOverride ? (requestPricing.margin as any).override_reason : null;
    const baseOpsTotal = Number(company.warehouse_ops_rate) * totalVolume;
    const logisticsSubtotal = baseOpsTotal + lineItemsTotals.catalog_total;
    const marginAmount = logisticsSubtotal * (marginPercent / 100);
    const finalTotal = logisticsSubtotal + marginAmount + lineItemsTotals.custom_total;

    const newPricing = {
        base_ops_total: baseOpsTotal.toFixed(2),
        logistics_sub_total: logisticsSubtotal.toFixed(2),
        line_items: {
            catalog_total: lineItemsTotals.catalog_total,
            custom_total: lineItemsTotals.custom_total,
        },
        margin: {
            percent: marginPercent,
            amount: marginAmount,
            is_override: marginOverride,
            override_reason: marginOverrideReason
        },
        final_total: finalTotal.toFixed(2),
        calculated_at: new Date(),
        calculated_by: user.id,
    }

    // Step 6: Update inbound request pricing and status
    await db.transaction(async (tx) => {
        // Step 6.1: Update inbound request pricing
        await tx.update(prices).set(newPricing).where(eq(prices.id, inboundRequest.request_pricing_id));

        // Step 6.2: Update inbound request status
        await tx
            .update(inboundRequests)
            .set({
                request_status: "PENDING_APPROVAL",
                updated_at: new Date(),
            })
            .where(eq(inboundRequests.id, inboundRequest.id));
    })

    // TODO: Step 7: Send notification
    // await NotificationLogServices.sendNotification(
    //     platformId,
    //     "A2_ADJUSTED_PRICING",
    //     {
    //         ...order,
    //         company
    //     }
    // );

    // Step 8: Return updated inbound request
    return {
        id: inboundRequest.id,
        request_status: "PENDING_APPROVAL",
        updated_at: new Date(),
    };
};

const approveInboundRequest = async (
    requestId: string,
    user: AuthUser,
    platformId: string,
    payload: ApproveInboundRequestPayload
) => {
    const { margin_override_percent, margin_override_reason } = payload;

    // Step 1: Fetch inbound request with details
    const [result] = await db
        .select({
            inbound_request: inboundRequests,
            company: {
                id: companies.id,
                name: companies.name,
                platform_margin_percent: companies.platform_margin_percent,
                warehouse_ops_rate: companies.warehouse_ops_rate,
            },
            request_pricing: {
                warehouse_ops_rate: prices.warehouse_ops_rate,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                transport: prices.transport,
                line_items: prices.line_items,
                margin: prices.margin,
                final_total: prices.final_total,
                calculated_at: prices.calculated_at,
            }
        })
        .from(inboundRequests)
        .leftJoin(companies, eq(inboundRequests.company_id, companies.id))
        .leftJoin(prices, eq(inboundRequests.request_pricing_id, prices.id))
        .where(and(eq(inboundRequests.id, requestId), eq(inboundRequests.platform_id, platformId)))
        .limit(1);

    const inboundRequest = result.inbound_request;
    const company = result.company;
    const requestPricing = result.request_pricing;

    if (!inboundRequest) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request not found");
    }
    if (!company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found for this inbound request");
    }
    if (!requestPricing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Request pricing not found for this inbound request");
    }

    if (inboundRequest.request_status !== "PENDING_APPROVAL") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Inbound request is not in PENDING_APPROVAL status. Current status: ${inboundRequest.request_status}`
        );
    }

    // Determine if this is a revised quote (order was previously quoted)
    const isRevisedQuote = ["QUOTE_SENT", "QUOTE_REVISED"].includes(inboundRequest.financial_status);
    const newFinancialStatus = isRevisedQuote ? "QUOTE_REVISED" : "QUOTE_SENT";

    let finalTotal = requestPricing.final_total;

    // Step 3: Update order pricing and status
    await db.transaction(async (tx) => {
        // Step 3.1: Update pricing if margin override is provided
        if (margin_override_percent) {
            const marginAmount = Number(requestPricing.logistics_sub_total) * (margin_override_percent / 100);
            const updatedFinalTotal = Number(requestPricing.logistics_sub_total) + marginAmount + Number((requestPricing.line_items as any).custom_total);

            finalTotal = updatedFinalTotal.toFixed(2);

            await tx.update(prices).set({
                margin: {
                    percent: margin_override_percent,
                    amount: marginAmount,
                    is_override: true,
                    override_reason: margin_override_reason
                },
                final_total: updatedFinalTotal.toFixed(2),
                calculated_at: new Date(),
                calculated_by: user.id,
            }).where(eq(prices.id, inboundRequest.request_pricing_id));
        }

        // Step 3.2: Update order status
        await tx
            .update(inboundRequests)
            .set({
                request_status: "QUOTED",
                financial_status: newFinancialStatus,
                updated_at: new Date(),
            })
            .where(eq(inboundRequests.id, inboundRequest.id));
    })

    // TODO
    // // Generate cost estimate PDF
    // await costEstimateGenerator(orderId, platformId, user);

    // // Step 4: Send notification
    // await NotificationLogServices.sendNotification(
    //     platformId,
    //     "QUOTE_SENT",
    //     {
    //         ...order,
    //         company
    //     }
    // );

    // Step 5: Return updated order
    return {
        id: inboundRequest.id,
        request_status: "QUOTED",
        financial_status: newFinancialStatus,
        final_total: finalTotal,
        updated_at: new Date(),
    };
};

export const InboundRequestServices = {
    createInboundRequest,
    getInboundRequests,
    getInboundRequestById,
    submitForApproval,
    approveInboundRequest
};
