import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, sql } from "drizzle-orm";
import httpStatus from "http-status";
import Papa from "papaparse";
import { db } from "../../../db";
import {
    assets,
    brands,
    cities,
    companies,
    inboundRequestItems,
    inboundRequests,
    lineItems,
    orderItems,
    orders,
    prices,
    scanEvents,
    serviceRequests,
    users,
    warehouses,
    zones,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { applyMarginPerLine } from "../../utils/pricing-engine";
import queryValidator from "../../utils/query-validator";
import {
    ExportAssetUtilizationQuery,
    ExportBaseQuery,
    ExportOrderQuery,
    ExportStockQuery,
} from "./export.interfaces";
import { orderQueryValidationConfig, orderSortableFields } from "../order/order.utils";

const ACTIVE_ASSET_OUT_STATUSES = [
    "READY_FOR_DELIVERY",
    "IN_TRANSIT",
    "DELIVERED",
    "IN_USE",
    "AWAITING_RETURN",
    "RETURN_IN_TRANSIT",
] as const;

const formatDate = (value: Date | string | null | undefined) =>
    value ? new Date(value).toISOString() : "";

const formatMoney = (value: number) => value.toFixed(2);

const parseNumber = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const parseDateRange = (query: { date_from?: string; date_to?: string }) => {
    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (query.date_from) {
        fromDate = new Date(query.date_from);
        if (isNaN(fromDate.getTime()))
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date_from format");
    }

    if (query.date_to) {
        toDate = new Date(query.date_to);
        if (isNaN(toDate.getTime()))
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date_to format");
    }

    return { fromDate, toDate };
};

const getScopedCompanyId = (queryCompanyId: string | undefined, user: AuthUser) => {
    if (user.role === "CLIENT") {
        if (!user.company_id)
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        return user.company_id;
    }
    return queryCompanyId;
};

const exportOrdersService = async (
    query: ExportOrderQuery,
    user: AuthUser,
    platformId: string
): Promise<string> => {
    const {
        search_term,
        sort_by,
        sort_order,
        company_id,
        brand_id,
        order_status,
        financial_status,
        date_from,
        date_to,
    } = query;

    if (sort_by) queryValidator(orderQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(orderQueryValidationConfig, "sort_order", sort_order);

    const conditions: any[] = [eq(orders.platform_id, platformId)];
    const scopedCompanyId = getScopedCompanyId(company_id, user);
    const { fromDate, toDate } = parseDateRange({ date_from, date_to });

    if (scopedCompanyId) conditions.push(eq(orders.company_id, scopedCompanyId));
    if (brand_id) conditions.push(eq(orders.brand_id, brand_id));

    if (order_status) {
        queryValidator(orderQueryValidationConfig, "order_status", order_status);
        conditions.push(eq(orders.order_status, order_status as any));
    }

    if (financial_status) {
        queryValidator(orderQueryValidationConfig, "financial_status", financial_status);
        conditions.push(eq(orders.financial_status, financial_status as any));
    }

    if (fromDate) conditions.push(gte(orders.created_at, fromDate));
    if (toDate) conditions.push(lte(orders.created_at, toDate));

    if (search_term) {
        const searchConditions = [
            ilike(orders.order_id, `%${search_term}%`),
            ilike(orders.contact_name, `%${search_term}%`),
            ilike(orders.venue_name, `%${search_term}%`),
            sql`EXISTS (
                SELECT 1 FROM ${orderItems}
                WHERE ${orderItems.order_id} = ${orders.id}
                AND ${orderItems.asset_name} ILIKE ${`%${search_term}%`}
            )`,
        ];
        conditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
    }

    const sortField = sort_by ? orderSortableFields[sort_by] : orders.created_at;
    const sortDirection = sort_order === "asc" ? asc(sortField) : desc(sortField);

    const results = await db
        .select({
            order: orders,
            company: { name: companies.name },
            brand: { name: brands.name },
            venue_city: { name: cities.name },
            pricing: {
                final_total: prices.final_total,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                transport: prices.transport,
            },
            item: orderItems,
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(brands, eq(orders.brand_id, brands.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .leftJoin(cities, eq(orders.venue_city_id, cities.id))
        .leftJoin(orderItems, eq(orders.id, orderItems.order_id))
        .where(and(...conditions))
        .orderBy(sortDirection);

    const csvData = results.map((row) => {
        const { order, company, brand, venue_city, pricing, item } = row;
        return {
            "Order ID": order.order_id,
            "Job Number": order.job_number || "",
            Status: order.order_status,
            "Financial Status": order.financial_status,
            Company: company?.name || "",
            Brand: brand?.name || "",
            "Contact Name": order.contact_name,
            "Contact Email": order.contact_email,
            "Event Start": formatDate(order.event_start_date),
            "Event End": formatDate(order.event_end_date),
            "Venue Name": order.venue_name,
            "Venue City": venue_city?.name || "",
            "Order Total Volume (m3)": (order.calculated_totals as any)?.volume || "0",
            "Order Total Weight (kg)": (order.calculated_totals as any)?.weight || "0",
            "Order Base Ops Total": pricing?.base_ops_total || "0",
            "Order Logistics Subtotal": pricing?.logistics_sub_total || "0",
            "Order Final Total": pricing?.final_total || "0",
            "Item Name": item?.asset_name || "",
            "Item Quantity": item?.quantity || "",
            "Item Volume (m3)": item?.total_volume || "",
            "Item Weight (kg)": item?.total_weight || "",
            "Item Condition Notes": item?.condition_notes || "",
            "Created At": formatDate(order.created_at),
        };
    });

    return Papa.unparse(csvData);
};

const exportOrderHistoryService = async (
    query: ExportOrderQuery,
    user: AuthUser,
    platformId: string
): Promise<string> => {
    const { company_id, date_from, date_to, order_status, financial_status } = query;
    const conditions: any[] = [eq(orders.platform_id, platformId)];
    const scopedCompanyId = getScopedCompanyId(company_id, user);
    const { fromDate, toDate } = parseDateRange({ date_from, date_to });

    if (scopedCompanyId) conditions.push(eq(orders.company_id, scopedCompanyId));
    if (fromDate) conditions.push(gte(orders.created_at, fromDate));
    if (toDate) conditions.push(lte(orders.created_at, toDate));

    if (order_status) {
        queryValidator(orderQueryValidationConfig, "order_status", order_status);
        conditions.push(eq(orders.order_status, order_status as any));
    }

    if (financial_status) {
        queryValidator(orderQueryValidationConfig, "financial_status", financial_status);
        conditions.push(eq(orders.financial_status, financial_status as any));
    }

    const rows = await db
        .select({
            order_id: orders.order_id,
            order_date: orders.created_at,
            company: companies.name,
            event_name: orders.venue_name,
            order_status: orders.order_status,
            financial_status: orders.financial_status,
            event_start_date: orders.event_start_date,
            event_end_date: orders.event_end_date,
            final_total: prices.final_total,
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .where(and(...conditions))
        .orderBy(desc(orders.created_at));

    return Papa.unparse(
        rows.map((row) => ({
            "Order ID": row.order_id,
            "Order Date": formatDate(row.order_date),
            Company: row.company || "",
            "Event Name": row.event_name || "",
            "Order Status": row.order_status,
            "Financial Status": row.financial_status,
            "Event Start Date": formatDate(row.event_start_date),
            "Event End Date": formatDate(row.event_end_date),
            "Final Total": formatMoney(parseNumber(row.final_total)),
        }))
    );
};

const exportAccountsReconciliationService = async (
    query: ExportBaseQuery,
    user: AuthUser,
    platformId: string
): Promise<string> => {
    const { company_id, date_from, date_to } = query;
    const scopedCompanyId = getScopedCompanyId(company_id, user);
    const { fromDate, toDate } = parseDateRange({ date_from, date_to });

    const orderConditions: any[] = [eq(orders.platform_id, platformId)];
    if (scopedCompanyId) orderConditions.push(eq(orders.company_id, scopedCompanyId));
    if (fromDate) orderConditions.push(gte(orders.created_at, fromDate));
    if (toDate) orderConditions.push(lte(orders.created_at, toDate));

    const serviceRequestConditions: any[] = [eq(serviceRequests.platform_id, platformId)];
    if (scopedCompanyId) serviceRequestConditions.push(eq(serviceRequests.company_id, scopedCompanyId));
    if (fromDate) serviceRequestConditions.push(gte(serviceRequests.created_at, fromDate));
    if (toDate) serviceRequestConditions.push(lte(serviceRequests.created_at, toDate));

    const [orderRows, serviceRequestRows] = await Promise.all([
        db
            .select({
                order: {
                    id: orders.id,
                    reference_id: orders.order_id,
                    created_at: orders.created_at,
                    context_name: orders.venue_name,
                },
                company: { name: companies.name },
                pricing: {
                    base_ops_total: prices.base_ops_total,
                    transport: prices.transport,
                    margin: prices.margin,
                },
                line_item: {
                    id: lineItems.id,
                    line_item_id: lineItems.line_item_id,
                    description: lineItems.description,
                    total: lineItems.total,
                    is_voided: lineItems.is_voided,
                },
            })
            .from(orders)
            .leftJoin(companies, eq(orders.company_id, companies.id))
            .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
            .leftJoin(lineItems, eq(lineItems.order_id, orders.id))
            .where(and(...orderConditions))
            .orderBy(asc(orders.created_at), asc(lineItems.line_item_id)),
        db
            .select({
                service_request: {
                    id: serviceRequests.id,
                    reference_id: serviceRequests.service_request_id,
                    created_at: serviceRequests.created_at,
                    context_name: serviceRequests.title,
                },
                company: { name: companies.name },
                pricing: {
                    base_ops_total: prices.base_ops_total,
                    transport: prices.transport,
                    margin: prices.margin,
                },
                line_item: {
                    id: lineItems.id,
                    line_item_id: lineItems.line_item_id,
                    description: lineItems.description,
                    total: lineItems.total,
                    is_voided: lineItems.is_voided,
                },
            })
            .from(serviceRequests)
            .leftJoin(companies, eq(serviceRequests.company_id, companies.id))
            .leftJoin(prices, eq(serviceRequests.request_pricing_id, prices.id))
            .leftJoin(lineItems, eq(lineItems.service_request_id, serviceRequests.id))
            .where(and(...serviceRequestConditions))
            .orderBy(asc(serviceRequests.created_at), asc(lineItems.line_item_id)),
    ]);

    const grouped = new Map<string, Array<Record<string, string>>>();

    const appendBaseRows = (
        groupKey: string,
        documentType: "ORDER" | "SERVICE_REQUEST",
        referenceId: string,
        createdAt: Date,
        companyName: string,
        contextName: string,
        baseBuy: number,
        transportBuy: number,
        marginPercent: number
    ) => {
        grouped.set(groupKey, [
            {
                "Document Type": documentType,
                "Order ID": referenceId,
                "Order Date": formatDate(createdAt),
                Company: companyName,
                "Event Name": contextName,
                "K-Number": "",
                Description: "Base Operations",
                "Buy Price": formatMoney(baseBuy),
                "Sell Price": formatMoney(applyMarginPerLine(baseBuy, marginPercent)),
                Margin: formatMoney(applyMarginPerLine(baseBuy, marginPercent) - baseBuy),
            },
        ]);

        if (transportBuy > 0) {
            grouped.get(groupKey)!.push({
                "Document Type": documentType,
                "Order ID": referenceId,
                "Order Date": formatDate(createdAt),
                Company: companyName,
                "Event Name": contextName,
                "K-Number": "",
                Description: "Transport",
                "Buy Price": formatMoney(transportBuy),
                "Sell Price": formatMoney(applyMarginPerLine(transportBuy, marginPercent)),
                Margin: formatMoney(applyMarginPerLine(transportBuy, marginPercent) - transportBuy),
            });
        }
    };

    for (const row of orderRows) {
        const groupKey = `ORDER:${row.order.id}`;
        const marginPercent = parseNumber((row.pricing?.margin as any)?.percent);

        if (!grouped.has(groupKey)) {
            appendBaseRows(
                groupKey,
                "ORDER",
                row.order.reference_id,
                row.order.created_at,
                row.company?.name || "",
                row.order.context_name || "",
                parseNumber(row.pricing?.base_ops_total),
                parseNumber((row.pricing?.transport as any)?.final_rate),
                marginPercent
            );
        }

        const line = row.line_item;
        if (!line?.id || line.is_voided) continue;
        const buy = parseNumber(line.total);
        const sell = applyMarginPerLine(buy, marginPercent);

        grouped.get(groupKey)!.push({
            "Document Type": "ORDER",
            "Order ID": row.order.reference_id,
            "Order Date": formatDate(row.order.created_at),
            Company: row.company?.name || "",
            "Event Name": row.order.context_name || "",
            "K-Number": line.line_item_id || "",
            Description: line.description || "",
            "Buy Price": formatMoney(buy),
            "Sell Price": formatMoney(sell),
            Margin: formatMoney(sell - buy),
        });
    }

    for (const row of serviceRequestRows) {
        const groupKey = `SERVICE_REQUEST:${row.service_request.id}`;
        const marginPercent = parseNumber((row.pricing?.margin as any)?.percent);

        if (!grouped.has(groupKey)) {
            appendBaseRows(
                groupKey,
                "SERVICE_REQUEST",
                row.service_request.reference_id,
                row.service_request.created_at,
                row.company?.name || "",
                row.service_request.context_name || "Service Request",
                parseNumber(row.pricing?.base_ops_total),
                parseNumber((row.pricing?.transport as any)?.final_rate),
                marginPercent
            );
        }

        const line = row.line_item;
        if (!line?.id || line.is_voided) continue;
        const buy = parseNumber(line.total);
        const sell = applyMarginPerLine(buy, marginPercent);

        grouped.get(groupKey)!.push({
            "Document Type": "SERVICE_REQUEST",
            "Order ID": row.service_request.reference_id,
            "Order Date": formatDate(row.service_request.created_at),
            Company: row.company?.name || "",
            "Event Name": row.service_request.context_name || "Service Request",
            "K-Number": line.line_item_id || "",
            Description: line.description || "",
            "Buy Price": formatMoney(buy),
            "Sell Price": formatMoney(sell),
            Margin: formatMoney(sell - buy),
        });
    }

    const csvRows: Array<Record<string, string>> = [];
    for (const rowsPerDocument of grouped.values()) {
        const subtotal = rowsPerDocument.reduce(
            (acc, row) => ({
                buy: acc.buy + parseNumber(row["Buy Price"]),
                sell: acc.sell + parseNumber(row["Sell Price"]),
                margin: acc.margin + parseNumber(row.Margin),
            }),
            { buy: 0, sell: 0, margin: 0 }
        );

        csvRows.push(...rowsPerDocument);
        csvRows.push({
            "Document Type": rowsPerDocument[0]["Document Type"],
            "Order ID": rowsPerDocument[0]["Order ID"],
            "Order Date": "",
            Company: rowsPerDocument[0].Company,
            "Event Name": "",
            "K-Number": "",
            Description: "DOCUMENT SUBTOTAL",
            "Buy Price": formatMoney(subtotal.buy),
            "Sell Price": formatMoney(subtotal.sell),
            Margin: formatMoney(subtotal.margin),
        });
    }

    return Papa.unparse(csvRows);
};

const exportStockReportService = async (
    query: ExportStockQuery,
    user: AuthUser,
    platformId: string
): Promise<string> => {
    const { company_id, condition, category, status } = query;
    const scopedCompanyId = getScopedCompanyId(company_id, user);
    const conditions: any[] = [eq(assets.platform_id, platformId), isNull(assets.deleted_at)];

    if (scopedCompanyId) conditions.push(eq(assets.company_id, scopedCompanyId));
    if (condition) conditions.push(eq(assets.condition, condition as any));
    if (category) conditions.push(eq(assets.category, category));
    if (status) conditions.push(eq(assets.status, status as any));

    const rows = await db
        .select({
            asset: {
                id: assets.id,
                name: assets.name,
                category: assets.category,
                condition: assets.condition,
                status: assets.status,
                total_quantity: assets.total_quantity,
                available_quantity: assets.available_quantity,
                qr_code: assets.qr_code,
                last_scanned_at: assets.last_scanned_at,
            },
            company: { name: companies.name },
            warehouse: { name: warehouses.name },
            zone: { name: zones.name },
        })
        .from(assets)
        .leftJoin(companies, eq(assets.company_id, companies.id))
        .leftJoin(warehouses, eq(assets.warehouse_id, warehouses.id))
        .leftJoin(zones, eq(assets.zone_id, zones.id))
        .where(and(...conditions))
        .orderBy(asc(companies.name), asc(assets.name));

    return Papa.unparse(
        rows.map((row) => ({
            "Asset ID": row.asset.id,
            "Asset Name": row.asset.name,
            Company: row.company?.name || "",
            Category: row.asset.category,
            Condition: row.asset.condition,
            Status: row.asset.status,
            "Total Quantity": row.asset.total_quantity.toString(),
            "Available Quantity": row.asset.available_quantity.toString(),
            Warehouse: row.warehouse?.name || "",
            Zone: row.zone?.name || "",
            "QR Code": row.asset.qr_code,
            "Last Scanned At": formatDate(row.asset.last_scanned_at),
        }))
    );
};

const exportAssetsOutService = async (
    query: ExportBaseQuery,
    user: AuthUser,
    platformId: string
): Promise<string> => {
    const { company_id, date_from, date_to } = query;
    const scopedCompanyId = getScopedCompanyId(company_id, user);
    const conditions: any[] = [
        eq(orders.platform_id, platformId),
        inArray(orders.order_status, ACTIVE_ASSET_OUT_STATUSES as any),
    ];
    const { fromDate, toDate } = parseDateRange({ date_from, date_to });

    if (scopedCompanyId) conditions.push(eq(orders.company_id, scopedCompanyId));
    if (fromDate) conditions.push(gte(orders.event_start_date, fromDate));
    if (toDate) conditions.push(lte(orders.event_end_date, toDate));

    const rows = await db
        .select({
            order: {
                order_id: orders.order_id,
                order_status: orders.order_status,
                event_start_date: orders.event_start_date,
                event_end_date: orders.event_end_date,
            },
            company: { name: companies.name },
            item: { asset_name: orderItems.asset_name, quantity: orderItems.quantity },
            asset: {
                qr_code: assets.qr_code,
                category: assets.category,
                condition: assets.condition,
                status: assets.status,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(orderItems, eq(orderItems.order_id, orders.id))
        .leftJoin(assets, eq(orderItems.asset_id, assets.id))
        .where(and(...conditions))
        .orderBy(asc(orders.event_end_date), asc(orders.order_id));

    return Papa.unparse(
        rows.map((row) => ({
            "Order ID": row.order.order_id,
            Company: row.company?.name || "",
            "Order Status": row.order.order_status,
            "Event Start Date": formatDate(row.order.event_start_date),
            "Expected Return Date": formatDate(row.order.event_end_date),
            "Asset Name": row.item?.asset_name || "",
            "Asset Category": row.asset?.category || "",
            "Asset QR": row.asset?.qr_code || "",
            "Asset Condition": row.asset?.condition || "",
            "Asset Status": row.asset?.status || "",
            Quantity: parseNumber(row.item?.quantity).toString(),
        }))
    );
};

const exportInboundLogService = async (
    query: ExportBaseQuery,
    user: AuthUser,
    platformId: string
): Promise<string> => {
    const { company_id, date_from, date_to } = query;
    const scopedCompanyId = getScopedCompanyId(company_id, user);
    const conditions: any[] = [eq(inboundRequests.platform_id, platformId)];
    const { fromDate, toDate } = parseDateRange({ date_from, date_to });

    if (scopedCompanyId) conditions.push(eq(inboundRequests.company_id, scopedCompanyId));
    if (fromDate) conditions.push(gte(inboundRequests.created_at, fromDate));
    if (toDate) conditions.push(lte(inboundRequests.created_at, toDate));

    const requests = await db
        .select({
            request: inboundRequests,
            company: { name: companies.name },
            requester: { name: users.name, email: users.email },
            pricing: { base_ops_total: prices.base_ops_total, final_total: prices.final_total },
        })
        .from(inboundRequests)
        .leftJoin(companies, eq(inboundRequests.company_id, companies.id))
        .leftJoin(users, eq(inboundRequests.requester_id, users.id))
        .leftJoin(prices, eq(inboundRequests.request_pricing_id, prices.id))
        .where(and(...conditions))
        .orderBy(desc(inboundRequests.created_at));

    const requestIds = requests.map((r) => r.request.id);
    const itemCounts = new Map<string, number>();
    if (requestIds.length > 0) {
        const counts = await db
            .select({
                request_id: inboundRequestItems.inbound_request_id,
                total: sql<number>`count(*)`,
            })
            .from(inboundRequestItems)
            .where(inArray(inboundRequestItems.inbound_request_id, requestIds))
            .groupBy(inboundRequestItems.inbound_request_id);

        counts.forEach((row) => itemCounts.set(row.request_id, parseNumber(row.total)));
    }

    return Papa.unparse(
        requests.map((row) => ({
            "Inbound Request ID": row.request.inbound_request_id,
            Company: row.company?.name || "",
            "Requester Name": row.requester?.name || "",
            "Requester Email": row.requester?.email || "",
            "Incoming At": formatDate(row.request.incoming_at),
            "Request Status": row.request.request_status,
            "Financial Status": row.request.financial_status,
            "Item Count": (itemCounts.get(row.request.id) || 0).toString(),
            "Base Ops Total": formatMoney(parseNumber(row.pricing?.base_ops_total)),
            "Final Total": formatMoney(parseNumber(row.pricing?.final_total)),
            Note: row.request.note || "",
            "Created At": formatDate(row.request.created_at),
        }))
    );
};

const exportRevenueReportService = async (
    query: ExportBaseQuery,
    user: AuthUser,
    platformId: string
): Promise<string> => {
    const { company_id, date_from, date_to } = query;
    const scopedCompanyId = getScopedCompanyId(company_id, user);
    const conditions: any[] = [eq(orders.platform_id, platformId)];
    const { fromDate, toDate } = parseDateRange({ date_from, date_to });

    if (scopedCompanyId) conditions.push(eq(orders.company_id, scopedCompanyId));
    if (fromDate) conditions.push(gte(orders.created_at, fromDate));
    if (toDate) conditions.push(lte(orders.created_at, toDate));

    const rows = await db
        .select({
            company_id: companies.id,
            company_name: companies.name,
            final_total: prices.final_total,
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .where(and(...conditions));

    const grouped = new Map<string, { company: string; total: number; count: number }>();
    for (const row of rows) {
        const key = row.company_id || "unknown";
        const current = grouped.get(key) || {
            company: row.company_name || "Unknown",
            total: 0,
            count: 0,
        };
        current.total += parseNumber(row.final_total);
        current.count += 1;
        grouped.set(key, current);
    }

    return Papa.unparse(
        Array.from(grouped.values()).map((row) => ({
            Company: row.company,
            "Orders Count": row.count.toString(),
            "Total Revenue": formatMoney(row.total),
            "Average Order Value": formatMoney(row.count ? row.total / row.count : 0),
        }))
    );
};

const exportCostReportService = async (
    query: ExportBaseQuery,
    user: AuthUser,
    platformId: string
): Promise<string> => {
    const { company_id, date_from, date_to } = query;
    const scopedCompanyId = getScopedCompanyId(company_id, user);
    const conditions: any[] = [eq(orders.platform_id, platformId)];
    const { fromDate, toDate } = parseDateRange({ date_from, date_to });

    if (scopedCompanyId) conditions.push(eq(orders.company_id, scopedCompanyId));
    if (fromDate) conditions.push(gte(orders.created_at, fromDate));
    if (toDate) conditions.push(lte(orders.created_at, toDate));

    const rows = await db
        .select({
            company_id: companies.id,
            company_name: companies.name,
            base_ops_total: prices.base_ops_total,
            transport: prices.transport,
            line_items: prices.line_items,
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .where(and(...conditions));

    const grouped = new Map<string, { company: string; total: number; count: number }>();
    for (const row of rows) {
        const key = row.company_id || "unknown";
        const transport = parseNumber((row.transport as any)?.final_rate);
        const catalog = parseNumber((row.line_items as any)?.catalog_total);
        const custom = parseNumber((row.line_items as any)?.custom_total);
        const buyTotal = parseNumber(row.base_ops_total) + transport + catalog + custom;

        const current = grouped.get(key) || {
            company: row.company_name || "Unknown",
            total: 0,
            count: 0,
        };
        current.total += buyTotal;
        current.count += 1;
        grouped.set(key, current);
    }

    return Papa.unparse(
        Array.from(grouped.values()).map((row) => ({
            Company: row.company,
            "Orders Count": row.count.toString(),
            "Total Buy Cost": formatMoney(row.total),
            "Average Buy Cost": formatMoney(row.count ? row.total / row.count : 0),
        }))
    );
};

const exportAssetUtilizationService = async (
    query: ExportAssetUtilizationQuery,
    user: AuthUser,
    platformId: string
): Promise<string> => {
    const { company_id, category, threshold_days } = query;
    const scopedCompanyId = getScopedCompanyId(company_id, user);
    const conditions: any[] = [eq(assets.platform_id, platformId), isNull(assets.deleted_at)];

    if (scopedCompanyId) conditions.push(eq(assets.company_id, scopedCompanyId));
    if (category) conditions.push(eq(assets.category, category));

    const rows = await db
        .select({
            asset: {
                id: assets.id,
                name: assets.name,
                category: assets.category,
                status: assets.status,
                condition: assets.condition,
                total_quantity: assets.total_quantity,
                available_quantity: assets.available_quantity,
            },
            company: { name: companies.name },
        })
        .from(assets)
        .leftJoin(companies, eq(assets.company_id, companies.id))
        .where(and(...conditions))
        .orderBy(asc(assets.name));

    const assetIds = rows.map((row) => row.asset.id);
    const usageMap = new Map<string, { last_used: Date | null; uses: number }>();

    if (assetIds.length > 0) {
        const usageRows = await db
            .select({
                asset_id: scanEvents.asset_id,
                last_used: sql<Date | null>`max(${scanEvents.scanned_at})`,
                uses: sql<number>`count(distinct ${scanEvents.order_id})`,
            })
            .from(scanEvents)
            .where(
                and(inArray(scanEvents.asset_id, assetIds), eq(scanEvents.scan_type, "OUTBOUND"))
            )
            .groupBy(scanEvents.asset_id);

        usageRows.forEach((row) =>
            usageMap.set(row.asset_id, {
                last_used: row.last_used ? new Date(row.last_used) : null,
                uses: parseNumber(row.uses),
            })
        );
    }

    const threshold = threshold_days ? parseNumber(threshold_days) : 0;
    const now = Date.now();
    const csvRows: Array<Record<string, string>> = [];

    for (const row of rows) {
        const usage = usageMap.get(row.asset.id) || { last_used: null, uses: 0 };
        const daysSinceUsed = usage.last_used
            ? Math.floor((now - usage.last_used.getTime()) / (1000 * 60 * 60 * 24))
            : null;

        if (threshold > 0 && daysSinceUsed !== null && daysSinceUsed < threshold) continue;

        csvRows.push({
            "Asset ID": row.asset.id,
            "Asset Name": row.asset.name,
            Company: row.company?.name || "",
            Category: row.asset.category,
            Status: row.asset.status,
            Condition: row.asset.condition,
            "Total Quantity": row.asset.total_quantity.toString(),
            "Available Quantity": row.asset.available_quantity.toString(),
            "Last Used Date": usage.last_used ? usage.last_used.toISOString() : "",
            "Days Since Used": daysSinceUsed === null ? "N/A" : daysSinceUsed.toString(),
            "Total Times Used": usage.uses.toString(),
        });
    }

    return Papa.unparse(csvRows);
};

export const ExportServices = {
    exportOrdersService,
    exportOrderHistoryService,
    exportAccountsReconciliationService,
    exportStockReportService,
    exportAssetsOutService,
    exportInboundLogService,
    exportRevenueReportService,
    exportCostReportService,
    exportAssetUtilizationService,
};
