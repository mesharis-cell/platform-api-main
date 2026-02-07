import httpStatus from "http-status";
import { db } from "../../../db";
import { assets, companies, inboundRequestItems, inboundRequests, lineItems, prices, users, warehouses, zones } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { eq, isNull, and, asc, count, desc, gte, ilike, lte, or, inArray } from "drizzle-orm";
import { ApproveInboundRequestPayload, ApproveOrDeclineQuoteByClientPayload, CancelInboundRequestPayload, CompleteInboundRequestPayload, InboundRequestPayload, UpdateInboundRequestItemPayload, UpdateInboundRequestPayload } from "./inbound-request.interfaces";
import { qrCodeGenerator } from "../../utils/qr-code-generator";
import paginationMaker from "../../utils/pagination-maker";
import queryValidator from "../../utils/query-validator";
import { inboundRequestIdGenerator, inboundRequestQueryValidationConfig, inboundRequestSortableFields } from "./inbound-request.utils";
import { LineItemsServices } from "../order-line-items/order-line-items.services";
import { inboundRequestInvoiceGenerator } from "../../utils/inbound-request-invoice";
import { inboundRequestCostEstimateGenerator } from "../../utils/inbound-request-cost-estimate";
import { getRequestPricingToShowClient } from "../../utils/pricing-calculation";

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

        const requestId = await inboundRequestIdGenerator(platformId);

        // Step 2.5: Insert inbound request record linked to pricing
        const [request] = await tx
            .insert(inboundRequests)
            .values({
                platform_id: platformId,
                inbound_request_id: requestId,
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
            images: item.images || [],
            asset_id: item.asset_id || null,
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
        inbound_request_id: result.request.inbound_request_id,
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

    // Step 5: Fetch line items for this request
    const lineItemsData = await db
        .select()
        .from(lineItems)
        .where(eq(lineItems.inbound_request_id, requestId));

    // Step 6: Format price for client
    let pricingToShowClient = null;
    if (result.request_pricing) {
        pricingToShowClient = getRequestPricingToShowClient({
            base_ops_total: result.request_pricing.base_ops_total,
            line_items: {
                catalog_total: (result.request_pricing.line_items as any).catalog_total,
                custom_total: (result.request_pricing.line_items as any).custom_total,
            },
            margin: {
                percent: (result.request_pricing.margin as any).percent,
            },
        });
    }

    // Step 7: Format the response
    return {
        id: result.request.id,
        inbound_request_id: result.request.inbound_request_id,
        platform_id: result.request.platform_id,
        incoming_at: result.request.incoming_at,
        note: result.request.note,
        request_status: result.request.request_status,
        financial_status: result.request.financial_status,
        company: result.company,
        requester: result.requester,
        request_pricing: user.role === "CLIENT" ? {
            ...(pricingToShowClient && pricingToShowClient)
        } : result.request_pricing,
        items: items,
        line_items: lineItemsData,
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
    const lineItemsTotals = await LineItemsServices.calculateInboundRequestLineItemsTotals(
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

// ----------------------------------- APPROVE INBOUND REQUEST BY ADMIN -----------------------
const approveInboundRequestByAdmin = async (
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


    // Step 4: Generate cost estimate PDF
    await inboundRequestCostEstimateGenerator(requestId, platformId);

    // TODO
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

// ----------------------------------- APPROVE OR DECLINE QUOTE BY CLIENT ---------------------
const approveOrDeclineQuoteByClient = async (
    requestId: string,
    user: AuthUser,
    platformId: string,
    payload: ApproveOrDeclineQuoteByClientPayload
) => {
    const { note, status } = payload;
    // Step 1: Fetch inbound request with company details
    const inboundRequest = await db.query.inboundRequests.findFirst({
        where: and(eq(inboundRequests.id, requestId), eq(inboundRequests.platform_id, platformId)),
    });

    if (!inboundRequest || user.company_id !== inboundRequest.company_id) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Inbound request not found or you do not have access to this inbound request"
        );
    }

    // Step 2: Verify inbound request is in QUOTED status
    if (inboundRequest.request_status !== "QUOTED") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Inbound request is not in QUOTED status");
    }

    await db
        .update(inboundRequests)
        .set({
            request_status: status,
            financial_status: status === "CONFIRMED" ? "QUOTE_ACCEPTED" : "CANCELLED",
            note: note,
            updated_at: new Date(),
        })
        .where(eq(inboundRequests.id, requestId));

    // TODO
    // await NotificationLogServices.sendNotification(platformId, "QUOTE_APPROVED", order);
    // await NotificationLogServices.sendNotification(platformId, "QUOTE_DECLINED", order);

    return {
        id: inboundRequest.id,
        request_status: status,
        financial_status: status === "CONFIRMED" ? "QUOTE_ACCEPTED" : "CANCELLED",
        note: note,
        updated_at: new Date(),
        message: `Quote ${status === "CONFIRMED" ? "approved" : "declined"} successfully.`
    };
};

// ----------------------------------- UPDATE INBOUND REQUEST ITEM ----------------------------
const updateInboundRequestItem = async (
    requestId: string,
    itemId: string,
    user: AuthUser,
    platformId: string,
    payload: UpdateInboundRequestItemPayload
) => {
    // Step 1: Fetch the inbound request to validate access and status
    const [result] = await db
        .select({
            request: inboundRequests,
            request_pricing: {
                id: prices.id,
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
        .leftJoin(prices, eq(inboundRequests.request_pricing_id, prices.id))
        .where(and(eq(inboundRequests.id, requestId), eq(inboundRequests.platform_id, platformId)));

    const inboundRequest = result.request;
    const requestPricing = result.request_pricing;

    if (!inboundRequest || !requestPricing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request or request pricing not found");
    }

    // Step 2: Check user access (CLIENT users can only update their company's requests)
    if (user.role === "CLIENT" && inboundRequest.company_id !== user.company_id) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "You do not have access to this inbound request");
    }

    // Step 3: Check if the inbound request is in a status that allows updates
    if (user.role === "CLIENT" && !["PRICING_REVIEW", "PENDING_APPROVAL"].includes(inboundRequest.request_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot update items when request status is ${inboundRequest.request_status}. Items can only be updated in PENDING_APPROVAL or PRICING_REVIEW status.`
        );
    }

    // Step 4: Fetch the item to verify it exists and belongs to this request
    const [existingItem] = await db
        .select()
        .from(inboundRequestItems)
        .where(and(eq(inboundRequestItems.id, itemId), eq(inboundRequestItems.inbound_request_id, requestId)))
        .limit(1);

    if (!existingItem) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request item not found");
    }

    // Step 5: Prepare update data
    const updateData: Record<string, any> = {};

    if (payload.brand_id !== undefined) {
        updateData.brand_id = payload.brand_id || null;
    }
    if (payload.name !== undefined) {
        updateData.name = payload.name;
    }
    if (payload.description !== undefined) {
        updateData.description = payload.description || null;
    }
    if (payload.category !== undefined) {
        updateData.category = payload.category;
    }
    if (payload.tracking_method !== undefined) {
        updateData.tracking_method = payload.tracking_method;
    }
    if (payload.quantity !== undefined) {
        updateData.quantity = payload.quantity;
    }
    if (payload.packaging !== undefined) {
        updateData.packaging = payload.packaging || null;
    }
    if (payload.weight_per_unit !== undefined) {
        updateData.weight_per_unit = payload.weight_per_unit.toString();
    }
    if (payload.volume_per_unit !== undefined) {
        updateData.volume_per_unit = payload.volume_per_unit.toString();
    }
    if (payload.dimensions !== undefined) {
        updateData.dimensions = payload.dimensions;
    }
    if (payload.images !== undefined) {
        updateData.images = payload.images;
    }
    if (payload.handling_tags !== undefined) {
        updateData.handling_tags = payload.handling_tags;
    }

    // Step 6: Update the item
    const [updatedItem] = await db
        .update(inboundRequestItems)
        .set(updateData)
        .where(eq(inboundRequestItems.id, itemId))
        .returning();

    // Step 7: Fetch items for this request to recalculate pricing
    const items = await db
        .select()
        .from(inboundRequestItems)
        .where(eq(inboundRequestItems.inbound_request_id, requestId));

    // Step 7.1: Calculate total volume from items
    const totalVolume = items.reduce((acc, item) => acc + ((item.quantity || 1) * Number(item.volume_per_unit)), 0);

    // Step 7.2: Calculate logistics costs and margin
    const baseOpsTotal = Number(requestPricing.warehouse_ops_rate) * totalVolume;
    const logisticsSubTotal = baseOpsTotal + Number((requestPricing.line_items as any).catalog_total || 0);
    const marginAmount = logisticsSubTotal * (Number((requestPricing.margin as any).percent) / 100);
    const finalTotal = logisticsSubTotal + marginAmount + Number((requestPricing.line_items as any).custom_total || 0);

    // Step 7.3: Prepare pricing details payload
    const pricingDetails = {
        base_ops_total: baseOpsTotal.toFixed(2),
        logistics_sub_total: logisticsSubTotal.toFixed(2),
        margin: {
            percent: Number((requestPricing.margin as any).percent),
            amount: marginAmount,
            is_override: false,
            override_reason: null
        },
        final_total: finalTotal.toFixed(2),
        calculated_at: new Date(),
        calculated_by: user.id,
    }

    // Step 7.4: Update pricing record
    await db.update(prices).set(pricingDetails).where(eq(prices.id, requestPricing.id));

    // Step 7.5: Regenerate cost estimate PDF
    await inboundRequestCostEstimateGenerator(requestId, platformId, true);

    return updatedItem;
};

// ----------------------------------- CANCEL INBOUND REQUEST ---------------------------------
const cancelInboundRequest = async (
    requestId: string,
    platformId: string,
    payload: CancelInboundRequestPayload
) => {
    // Step 1: Fetch the inbound request to validate access and status
    const [inboundRequest] = await db
        .select()
        .from(inboundRequests)
        .where(and(eq(inboundRequests.id, requestId), eq(inboundRequests.platform_id, platformId)))
        .limit(1);

    if (!inboundRequest) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request not found");
    }

    // Step 2: Check if the inbound request is in a status that allows cancellation
    if (["COMPLETED", "CANCELLED"].includes(inboundRequest.request_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot cancel request when status is ${inboundRequest.request_status}`
        );
    }

    // Step 3: Update statuse
    await db
        .update(inboundRequests)
        .set({
            request_status: "CANCELLED",
            financial_status: "CANCELLED",
            note: payload.note,
            updated_at: new Date(),
        })
        .where(eq(inboundRequests.id, requestId));

    // Step 4: Return updated request
    return {
        id: inboundRequest.id,
        request_status: "CANCELLED",
        financial_status: "CANCELLED",
        updated_at: new Date(),
        message: "Inbound request cancelled successfully"
    };
};

// ----------------------------------- COMPLETE INBOUND REQUEST -------------------------------
const completeInboundRequest = async (
    requestId: string,
    platformId: string,
    user: AuthUser,
    payload: CompleteInboundRequestPayload
) => {
    const { warehouse_id, zone_id } = payload;

    // Step 1: Fetch the inbound request to validate access and status
    const [inboundRequest] = await db
        .select()
        .from(inboundRequests)
        .where(and(eq(inboundRequests.id, requestId), eq(inboundRequests.platform_id, platformId)))
        .limit(1);

    if (!inboundRequest) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request not found");
    }

    // Step 2: Verify inbound request is in CONFIRMED status
    if (inboundRequest.request_status !== "CONFIRMED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot complete inbound request. Current status: ${inboundRequest.request_status}. Request must be in CONFIRMED status.`
        );
    }

    // Step 3: Validate warehouse exists and belongs to the platform
    const [warehouse] = await db
        .select()
        .from(warehouses)
        .where(and(eq(warehouses.id, warehouse_id), eq(warehouses.platform_id, platformId)))
        .limit(1);

    if (!warehouse) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Warehouse not found");
    }

    // Step 4: Validate zone exists and belongs to the warehouse and company
    const [zone] = await db
        .select()
        .from(zones)
        .where(and(
            eq(zones.id, zone_id),
            eq(zones.warehouse_id, warehouse_id),
            eq(zones.company_id, inboundRequest.company_id)
        ))
        .limit(1);

    if (!zone) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Zone not found or does not belong to the specified warehouse and company");
    }

    // Step 5: Fetch inbound request items
    const items = await db
        .select()
        .from(inboundRequestItems)
        .where(eq(inboundRequestItems.inbound_request_id, requestId));

    if (items.length === 0) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "No items found for this inbound request");
    }

    // Step 6: Create/update assets from items in a transaction
    const processedAssets = await db.transaction(async (tx) => {
        const resultAssets: { asset: any; action: 'created' | 'updated'; quantityAdded: number }[] = [];

        for (const item of items) {
            if (item.tracking_method === "BATCH") {
                // For BATCH items, search for existing asset by id in the same company
                let existingAsset: typeof assets.$inferSelect | undefined;

                if (item.asset_id) {
                    [existingAsset] = await tx
                        .select()
                        .from(assets)
                        .where(and(
                            eq(assets.id, item.asset_id),
                            eq(assets.company_id, inboundRequest.company_id),
                            eq(assets.platform_id, platformId),
                            isNull(assets.deleted_at)
                        ))
                        .limit(1);
                }

                if (existingAsset) {
                    // Update existing asset quantity
                    const newTotalQuantity = existingAsset.total_quantity + item.quantity;
                    const newAvailableQuantity = existingAsset.available_quantity + item.quantity;

                    const [updatedAsset] = await tx
                        .update(assets)
                        .set({
                            total_quantity: newTotalQuantity,
                            available_quantity: newAvailableQuantity,
                        })
                        .where(eq(assets.id, existingAsset.id))
                        .returning();

                    resultAssets.push({
                        asset: updatedAsset,
                        action: 'updated',
                        quantityAdded: item.quantity
                    });

                } else {
                    // Create new BATCH asset if none exists with this id
                    const qrCode = await qrCodeGenerator(inboundRequest.company_id);

                    const [newAsset] = await tx
                        .insert(assets)
                        .values({
                            platform_id: platformId,
                            company_id: inboundRequest.company_id,
                            warehouse_id,
                            zone_id,
                            brand_id: item.brand_id,
                            name: item.name,
                            description: item.description,
                            category: item.category,
                            tracking_method: item.tracking_method,
                            total_quantity: item.quantity,
                            available_quantity: item.quantity,
                            qr_code: qrCode,
                            packaging: item.packaging,
                            weight_per_unit: item.weight_per_unit,
                            dimensions: item.dimensions || {},
                            volume_per_unit: item.volume_per_unit,
                            handling_tags: item.handling_tags || [],
                            images: item.images || [],
                        })
                        .returning();

                    resultAssets.push({
                        asset: newAsset,
                        action: 'created',
                        quantityAdded: item.quantity
                    });

                    await tx
                        .update(inboundRequestItems)
                        .set({ asset_id: newAsset.id })
                        .where(eq(inboundRequestItems.id, item.id));
                }
            } else {
                // For INDIVIDUAL items, always create a new asset
                const qrCode = await qrCodeGenerator(inboundRequest.company_id);

                const [newAsset] = await tx
                    .insert(assets)
                    .values({
                        platform_id: platformId,
                        company_id: inboundRequest.company_id,
                        warehouse_id: warehouse_id,
                        zone_id: zone_id,
                        brand_id: item.brand_id,
                        name: item.name,
                        description: item.description,
                        category: item.category,
                        tracking_method: item.tracking_method,
                        total_quantity: item.quantity,
                        available_quantity: item.quantity,
                        qr_code: qrCode,
                        packaging: item.packaging,
                        weight_per_unit: item.weight_per_unit,
                        dimensions: item.dimensions || {},
                        volume_per_unit: item.volume_per_unit,
                        handling_tags: item.handling_tags || [],
                        images: item.images || [],
                    })
                    .returning();

                resultAssets.push({
                    asset: newAsset,
                    action: 'created',
                    quantityAdded: item.quantity
                });

                // Update the inbound request item with the created asset id
                await tx
                    .update(inboundRequestItems)
                    .set({ asset_id: newAsset.id })
                    .where(eq(inboundRequestItems.id, item.id));
            }
        }

        // Step 7: Update inbound request status to COMPLETED
        await tx
            .update(inboundRequests)
            .set({
                request_status: "COMPLETED",
                financial_status: "INVOICED",
                updated_at: new Date(),
            })
            .where(eq(inboundRequests.id, requestId));

        return resultAssets;
    });

    await inboundRequestInvoiceGenerator(requestId, platformId, user);

    const createdCount = processedAssets.filter(a => a.action === 'created').length;
    const updatedCount = processedAssets.filter(a => a.action === 'updated').length;

    return {
        id: inboundRequest.id,
        request_status: "COMPLETED",
        assets_created: createdCount,
        assets_updated: updatedCount,
        assets: processedAssets.map(({ asset, action, quantityAdded }) => ({
            id: asset.id,
            name: asset.name,
            qr_code: asset.qr_code,
            category: asset.category,
            total_quantity: asset.total_quantity,
            quantity_added: quantityAdded,
            action: action,
        })),
        message: `Successfully processed ${items.length} items: ${createdCount} assets created, ${updatedCount} assets updated.`
    };
};

// ----------------------------------- UPDATE INBOUND REQUEST --------------------------------
const updateInboundRequest = async (
    requestId: string,
    user: AuthUser,
    platformId: string,
    payload: UpdateInboundRequestPayload
) => {
    // Step 1: Fetch the inbound request to validate access and status
    const [result] = await db
        .select({
            request: inboundRequests,
            request_pricing: {
                id: prices.id,
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
        .leftJoin(prices, eq(inboundRequests.request_pricing_id, prices.id))
        .where(and(eq(inboundRequests.id, requestId), eq(inboundRequests.platform_id, platformId)));

    const inboundRequest = result?.request;
    const requestPricing = result?.request_pricing;

    if (!inboundRequest || !requestPricing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Inbound request or request pricing not found");
    }

    // Step 2: Check user access (CLIENT users can only update their company's requests)
    if (user.role === "CLIENT" && inboundRequest.company_id !== user.company_id) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "You do not have access to this inbound request");
    }

    // Step 3: Check if request is in allowed status
    if (user.role === "CLIENT" && !["PRICING_REVIEW", "PENDING_APPROVAL"].includes(inboundRequest.request_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot update request when status is ${inboundRequest.request_status}. Metadata can only be updated in PRICING_REVIEW or PENDING_APPROVAL status.`
        );
    }

    // Step 4: Perform updates in transaction
    return await db.transaction(async (tx) => {
        // Step 4.1: Update request details
        const updateData: any = {};
        if (payload.note !== undefined) updateData.note = payload.note;
        if (payload.incoming_at !== undefined) {
            // Validate incoming date is at least 24 hours in the future
            const incomingAt = new Date(payload.incoming_at);
            const now = new Date();
            const minIncomingDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
            if (incomingAt < minIncomingDate) {
                throw new CustomizedError(httpStatus.BAD_REQUEST, "Incoming date must be at least 24 hours in the future");
            }
            updateData.incoming_at = incomingAt;
        }

        if (Object.keys(updateData).length > 0) {
            updateData.updated_at = new Date();
            await tx
                .update(inboundRequests)
                .set(updateData)
                .where(eq(inboundRequests.id, requestId));
        }

        // Step 4.2: Handle items update if provided
        if (payload.items) {
            // Get existing items
            const existingItems = await tx
                .select()
                .from(inboundRequestItems)
                .where(eq(inboundRequestItems.inbound_request_id, requestId));

            const existingItemIds = existingItems.map(item => item.id);
            const payloadItemIds = payload.items
                .filter(item => item.item_id)
                .map(item => item.item_id as string);

            // Identify items to delete
            const itemsToDelete = existingItemIds.filter(id => !payloadItemIds.includes(id));
            if (itemsToDelete.length > 0) {
                await tx
                    .delete(inboundRequestItems)
                    .where(inArray(inboundRequestItems.id, itemsToDelete));
            }

            // Identify items to update vs create
            const itemsToCreate: any[] = [];

            for (const item of payload.items) {
                if (item.item_id && existingItemIds.includes(item.item_id)) {
                    // Update existing item
                    const itemUpdateData: any = {};
                    if (item.brand_id !== undefined) itemUpdateData.brand_id = item.brand_id || null;
                    if (item.name) itemUpdateData.name = item.name;
                    if (item.description !== undefined) itemUpdateData.description = item.description || null;
                    if (item.category) itemUpdateData.category = item.category;
                    if (item.tracking_method) itemUpdateData.tracking_method = item.tracking_method;
                    if (item.quantity) itemUpdateData.quantity = item.quantity;
                    if (item.packaging !== undefined) itemUpdateData.packaging = item.packaging || null;
                    if (item.weight_per_unit !== undefined) itemUpdateData.weight_per_unit = item.weight_per_unit.toString();
                    if (item.dimensions) itemUpdateData.dimensions = item.dimensions;
                    if (item.volume_per_unit !== undefined) itemUpdateData.volume_per_unit = item.volume_per_unit.toString();
                    if (item.handling_tags) itemUpdateData.handling_tags = item.handling_tags;
                    if (item.images) itemUpdateData.images = item.images;
                    if (item.asset_id !== undefined) itemUpdateData.asset_id = item.asset_id || null;

                    if (Object.keys(itemUpdateData).length > 0) {
                        await tx
                            .update(inboundRequestItems)
                            .set(itemUpdateData)
                            .where(eq(inboundRequestItems.id, item.item_id));
                    }
                } else {
                    // Prepare new item
                    itemsToCreate.push({
                        inbound_request_id: requestId,
                        brand_id: item.brand_id || null,
                        name: item.name,
                        description: item.description,
                        category: item.category,
                        tracking_method: item.tracking_method,
                        quantity: item.quantity || 1,
                        packaging: item.packaging,
                        weight_per_unit: (item.weight_per_unit || 0).toString(),
                        dimensions: item.dimensions || {},
                        volume_per_unit: (item.volume_per_unit || 0).toString(),
                        handling_tags: item.handling_tags || [],
                        images: item.images || [],
                        asset_id: item.asset_id || null,
                    });
                }
            }

            // Insert new items
            if (itemsToCreate.length > 0) {
                await tx.insert(inboundRequestItems).values(itemsToCreate);
            }

            // Step 4.3: Recalculate pricing
            // Fetch all current items
            const currentItems = await tx
                .select()
                .from(inboundRequestItems)
                .where(eq(inboundRequestItems.inbound_request_id, requestId));

            // Calculate total volume
            const totalVolume = currentItems.reduce((acc, item) => acc + ((item.quantity || 1) * Number(item.volume_per_unit)), 0);

            // Calculate logistics costs and margin
            const baseOpsTotal = Number(requestPricing.warehouse_ops_rate) * totalVolume;
            const logisticsSubTotal = baseOpsTotal + Number((requestPricing.line_items as any).catalog_total || 0);
            const marginAmount = logisticsSubTotal * (Number((requestPricing.margin as any).percent) / 100);
            const finalTotal = logisticsSubTotal + marginAmount + Number((requestPricing.line_items as any).custom_total || 0);

            // Update pricing record
            await tx.update(prices).set({
                base_ops_total: baseOpsTotal.toFixed(2),
                logistics_sub_total: logisticsSubTotal.toFixed(2),
                margin: {
                    ...(requestPricing.margin as any),
                    amount: marginAmount
                },
                final_total: finalTotal.toFixed(2),
                calculated_at: new Date(),
                calculated_by: user.id
            }).where(eq(prices.id, inboundRequest.request_pricing_id));
        }

        return await getInboundRequestById(requestId, user, platformId);
    });
};

export const InboundRequestServices = {
    createInboundRequest,
    getInboundRequests,
    getInboundRequestById,
    submitForApproval,
    approveInboundRequestByAdmin,
    approveOrDeclineQuoteByClient,
    updateInboundRequestItem,
    completeInboundRequest,
    cancelInboundRequest,
    updateInboundRequest
};
