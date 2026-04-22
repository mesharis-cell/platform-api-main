import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, sql } from "drizzle-orm";
import httpStatus from "http-status";
import Papa from "papaparse";
import { db } from "../../../db";
import {
    assetCategories,
    assets,
    assetFamilies,
    brands,
    cities,
    companies,
    inboundRequestItems,
    inboundRequests,
    orderItems,
    orders,
    prices,
    scanEvents,
    selfPickupItems,
    selfPickups,
    stockMovements,
    users,
    warehouses,
    zones,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import {
    listAllCommercialContexts,
    NormalizedCommercialDocumentContext,
} from "../../utils/commercial-documents";
import { PricingService } from "../../services/pricing.service";
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
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
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
        const pricingSummary = PricingService.projectSummaryForRole(pricing as any, "ADMIN") as any;
        const pricingDetail = PricingService.projectByRole(pricing as any, "ADMIN") as any;
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
            "Order Base Ops Total": pricingDetail?.base_ops_total || "0",
            "Order Margin %": pricingSummary?.margin_percent ?? "0",
            "Order Final Total": pricingSummary?.final_total || "0",
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
            pricing: {
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
            },
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
            "Final Total": formatMoney(
                parseNumber(
                    PricingService.projectSummaryForRole(row.pricing as any, "ADMIN")?.final_total
                )
            ),
        }))
    );
};

const contextToReconciliationRows = (ctx: NormalizedCommercialDocumentContext) => {
    const rows: Array<Record<string, string>> = [];
    const shared = {
        "Document Type": ctx.context_type,
        "Reference ID": ctx.reference_id,
        Date: formatDate(ctx.timeline.start),
        Company: ctx.company.name,
        "Context Name": ctx.context_type === "ORDER" ? ctx.venue.name : "Service Request",
    };

    for (const li of ctx.line_items) {
        rows.push({
            ...shared,
            "K-Number": li.line_item_id,
            Description: li.description,
            "Buy Price": formatMoney(li.buy_total),
            "Sell Price": formatMoney(li.sell_total),
            Margin: formatMoney(li.sell_total - li.buy_total),
        });
    }

    const subtotal = rows.reduce(
        (acc, row) => ({
            buy: acc.buy + parseNumber(row["Buy Price"]),
            sell: acc.sell + parseNumber(row["Sell Price"]),
            margin: acc.margin + parseNumber(row.Margin),
        }),
        { buy: 0, sell: 0, margin: 0 }
    );

    rows.push({
        "Document Type": ctx.context_type,
        "Reference ID": ctx.reference_id,
        Date: "",
        Company: ctx.company.name,
        "Context Name": "",
        "K-Number": "",
        Description: "DOCUMENT SUBTOTAL",
        "Buy Price": formatMoney(subtotal.buy),
        "Sell Price": formatMoney(subtotal.sell),
        Margin: formatMoney(subtotal.margin),
    });

    return rows;
};

const exportAccountsReconciliationService = async (
    query: ExportBaseQuery,
    _user: AuthUser,
    platformId: string
): Promise<string> => {
    const { company_id, date_from, date_to } = query;
    const { fromDate, toDate } = parseDateRange({ date_from, date_to });

    const contexts = await listAllCommercialContexts(platformId, {
        company_id,
        date_from: fromDate,
        date_to: toDate,
    });

    const csvRows = contexts.flatMap(contextToReconciliationRows);
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
                family_id: assets.family_id,
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
            family: {
                name: assetFamilies.name,
                stock_mode: assetFamilies.stock_mode,
            },
            warehouse: { name: warehouses.name },
            zone: { name: zones.name },
        })
        .from(assets)
        .leftJoin(companies, eq(assets.company_id, companies.id))
        .leftJoin(assetFamilies, eq(assets.family_id, assetFamilies.id))
        .leftJoin(warehouses, eq(assets.warehouse_id, warehouses.id))
        .leftJoin(zones, eq(assets.zone_id, zones.id))
        .where(and(...conditions))
        .orderBy(asc(companies.name), asc(assets.name));

    return Papa.unparse(
        rows.map((row) => ({
            "Asset ID": row.asset.id,
            "Family ID": row.asset.family_id || "",
            "Family Name": row.family?.name || "",
            "Stock Mode": row.family?.stock_mode || "",
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
            pricing: {
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
            },
        })
        .from(inboundRequests)
        .leftJoin(companies, eq(inboundRequests.company_id, companies.id))
        .leftJoin(users, eq(inboundRequests.created_by, users.id))
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
        requests.map((row) => {
            const pricingSummary = PricingService.projectSummaryForRole(
                row.pricing as any,
                "ADMIN"
            ) as any;
            const pricingDetail = PricingService.projectByRole(row.pricing as any, "ADMIN") as any;
            return {
                "Inbound Request ID": row.request.inbound_request_id,
                Company: row.company?.name || "",
                "Requester Name": row.requester?.name || "",
                "Requester Email": row.requester?.email || "",
                "Incoming At": formatDate(row.request.incoming_at),
                "Request Status": row.request.request_status,
                "Financial Status": row.request.financial_status,
                "Item Count": (itemCounts.get(row.request.id) || 0).toString(),
                "Base Ops Total": formatMoney(parseNumber(pricingDetail?.base_ops_total)),
                "Final Total": formatMoney(parseNumber(pricingSummary?.final_total)),
                Note: row.request.note || "",
                "Created At": formatDate(row.request.created_at),
            };
        })
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
            pricing: {
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
            },
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
        current.total += parseNumber(
            PricingService.projectSummaryForRole(row.pricing as any, "ADMIN")?.final_total
        );
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
            pricing: {
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .where(and(...conditions));

    const grouped = new Map<string, { company: string; total: number; count: number }>();
    for (const row of rows) {
        const key = row.company_id || "unknown";
        const buyTotal = parseNumber(
            PricingService.projectSummaryForRole(row.pricing as any, "LOGISTICS")?.final_total
        );

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
                family_id: assets.family_id,
                name: assets.name,
                category: assets.category,
                status: assets.status,
                condition: assets.condition,
                total_quantity: assets.total_quantity,
                available_quantity: assets.available_quantity,
            },
            company: { name: companies.name },
            family: {
                name: assetFamilies.name,
                stock_mode: assetFamilies.stock_mode,
            },
        })
        .from(assets)
        .leftJoin(companies, eq(assets.company_id, companies.id))
        .leftJoin(assetFamilies, eq(assets.family_id, assetFamilies.id))
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

        usageRows.forEach((row) => {
            if (!row.asset_id) return;
            usageMap.set(row.asset_id, {
                last_used: row.last_used ? new Date(row.last_used) : null,
                uses: parseNumber(row.uses),
            });
        });
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
            "Family ID": row.asset.family_id || "",
            "Family Name": row.family?.name || "",
            "Stock Mode": row.family?.stock_mode || "",
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

/**
 * Work Summary Export — Warehouse use
 *
 * One row per order showing the buy-side cost breakdown (what the platform owes
 * the warehouse). The warehouse uses this to create their own invoice to the platform.
 *
 * Columns: Order ID, Company, Event Start, Event End, Status,
 *          Ops Total, Margin %, Catalog Line Items,
 *          Custom Line Items, Total Buy Cost
 */
const exportWorkSummaryService = async (
    query: ExportBaseQuery,
    _user: AuthUser,
    platformId: string
): Promise<string> => {
    const { company_id, date_from, date_to } = query;
    const { fromDate, toDate } = parseDateRange({ date_from, date_to });

    const conditions: any[] = [
        eq(orders.platform_id, platformId),
        // Exclude drafts — only orders that actually incurred work
        sql`${orders.order_status} NOT IN ('DRAFT', 'CANCELLED')`,
    ];

    if (company_id) conditions.push(eq(orders.company_id, company_id));
    if (fromDate) conditions.push(gte(orders.event_start_date, fromDate));
    if (toDate) conditions.push(lte(orders.event_end_date, toDate));

    const rows = await db
        .select({
            order_id: orders.order_id,
            order_status: orders.order_status,
            event_start_date: orders.event_start_date,
            event_end_date: orders.event_end_date,
            company_name: companies.name,
            pricing: {
                breakdown_lines: prices.breakdown_lines,
                margin_percent: prices.margin_percent,
                vat_percent: prices.vat_percent,
                margin_is_override: prices.margin_is_override,
                margin_override_reason: prices.margin_override_reason,
                calculated_at: prices.calculated_at,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .where(and(...conditions))
        .orderBy(asc(orders.event_start_date), asc(orders.order_id));

    return Papa.unparse(
        rows.map((row) => {
            const projected = PricingService.projectByRole(row.pricing as any, "LOGISTICS") as any;
            const ops = parseNumber(projected?.base_ops_total);
            const catalogItems = parseNumber(projected?.line_items?.catalog_total);
            const customItems = parseNumber(projected?.line_items?.custom_total);
            const totalBuy = parseNumber(projected?.final_total);

            return {
                "Order ID": row.order_id,
                Company: row.company_name || "",
                "Event Start": formatDate(row.event_start_date),
                "Event End": formatDate(row.event_end_date),
                Status: row.order_status,
                "Ops Total": formatMoney(ops),
                "Margin %": "N/A",
                "Catalog Items": formatMoney(catalogItems),
                "Custom Items": formatMoney(customItems),
                "Total Buy Cost": formatMoney(totalBuy),
            };
        })
    );
};

/**
 * Client Issuance Log — one row per item delivered via an order or self-pickup.
 *
 * Source: `order_items` (post-outbound orders) ∪ `self_pickup_items` (post-handover SPs).
 * Deliberately item-level, not pricing-level (order_items, NOT line_items) — no margin/
 * buy-cost leakage. "Post-outbound" means the entity has left the warehouse:
 *   orders: order_status ∈ [READY_FOR_DELIVERY, IN_TRANSIT, DELIVERED, IN_USE,
 *                           DERIG, AWAITING_RETURN, RETURN_IN_TRANSIT, CLOSED]
 *   self-pickups: self_pickup_status ∈ [PICKED_UP, AWAITING_RETURN, CLOSED]
 *
 * Qty semantics (deliberate asymmetry — not a gap):
 *   orders — ordered quantity IS delivered quantity by design. Orders do not
 *     support partial outbound; the outbound scan phase requires every booked
 *     unit to be accounted for before transitioning out of IN_PREPARATION.
 *     So "Requested Qty" = "Delivered Qty" = order_items.quantity, and
 *     Line Status is always "DELIVERED".
 *   self-pickups — `COALESCE(scanned_quantity, quantity)` per migration 0048
 *     (partial/skip/added-midflow). Status column exposes FULL/PARTIAL/SKIPPED/ADDED.
 *
 * Date semantics: primary "Issued At" = MAX(scan_events.scanned_at WHERE scan_type='OUTBOUND').
 *   Present for every post-outbound entity since the transition to READY_FOR_DELIVERY /
 *   PICKED_UP is gated on scans completing. Fallback to entity.updated_at on rare edge cases.
 *
 * Audience: ops only (ADMIN/LOGISTICS). PMG delivers to client manually.
 */
const ISSUANCE_ORDER_STATUSES = [
    "READY_FOR_DELIVERY",
    "IN_TRANSIT",
    "DELIVERED",
    "IN_USE",
    "DERIG",
    "AWAITING_RETURN",
    "RETURN_IN_TRANSIT",
    "CLOSED",
] as const;

const ISSUANCE_SP_STATUSES = ["PICKED_UP", "AWAITING_RETURN", "CLOSED"] as const;

const deriveSpStatus = (row: {
    quantity: number;
    scanned_quantity: number | null;
    skipped: boolean;
    added_midflow: boolean;
}): "FULL" | "PARTIAL" | "SKIPPED" | "ADDED_MIDFLOW" => {
    if (row.skipped) return "SKIPPED";
    if (row.added_midflow) return "ADDED_MIDFLOW";
    if (row.scanned_quantity == null) return "FULL";
    if (row.scanned_quantity === 0) return "SKIPPED";
    if (row.scanned_quantity < row.quantity) return "PARTIAL";
    return "FULL";
};

const buildOrderPurpose = (o: {
    contact_name: string | null;
    job_number: string | null;
    po_number: string | null;
    event_start_date: Date | string | null;
    event_end_date: Date | string | null;
    brand_name?: string | null;
}) => {
    const bits: string[] = [];
    if (o.brand_name) bits.push(`Brand: ${o.brand_name}`);
    if (o.contact_name) bits.push(`Contact: ${o.contact_name}`);
    if (o.event_start_date)
        bits.push(
            `Event: ${formatDate(o.event_start_date)}${
                o.event_end_date ? ` → ${formatDate(o.event_end_date)}` : ""
            }`
        );
    if (o.job_number) bits.push(`Job: ${o.job_number}`);
    if (o.po_number) bits.push(`PO: ${o.po_number}`);
    return bits.join(" | ");
};

const buildSpPurpose = (s: {
    collector_name: string;
    collector_phone: string | null;
    job_number: string | null;
    po_number: string | null;
    brand_name?: string | null;
}) => {
    const bits: string[] = [];
    if (s.brand_name) bits.push(`Brand: ${s.brand_name}`);
    bits.push(
        `Collector: ${s.collector_name}${s.collector_phone ? ` (${s.collector_phone})` : ""}`
    );
    if (s.job_number) bits.push(`Job: ${s.job_number}`);
    if (s.po_number) bits.push(`PO: ${s.po_number}`);
    return bits.join(" | ");
};

const exportClientIssuanceLogService = async (
    query: import("./export.interfaces").ExportClientIssuanceLogQuery,
    user: AuthUser,
    platformId: string
): Promise<string> => {
    const { company_id, date_from, date_to, scope, entity_type, created_by } = query;
    const scopedCompanyId = getScopedCompanyId(company_id, user);
    const { fromDate, toDate } = parseDateRange({ date_from, date_to });

    // MAX(scanned_at) correlated subqueries — one per entity.
    const orderIssuedAt = sql<Date | null>`(
        SELECT MAX(se.scanned_at) FROM ${scanEvents} se
        WHERE se."order" = ${orders.id} AND se.scan_type = 'OUTBOUND'
    )`;
    const spIssuedAt = sql<Date | null>`(
        SELECT MAX(se.scanned_at) FROM ${scanEvents} se
        WHERE se.self_pickup_id = ${selfPickups.id} AND se.scan_type = 'OUTBOUND'
    )`;

    const includeOrders = entity_type !== "SELF_PICKUP";
    const includeSPs = entity_type !== "ORDER";

    type Row = Record<string, string>;
    const rows: Row[] = [];

    if (includeOrders) {
        const orderConditions: any[] = [eq(orders.platform_id, platformId)];
        if (scope !== "all") {
            orderConditions.push(inArray(orders.order_status, ISSUANCE_ORDER_STATUSES as any));
        }
        if (scopedCompanyId) orderConditions.push(eq(orders.company_id, scopedCompanyId));
        if (created_by) orderConditions.push(eq(orders.created_by, created_by));
        if (fromDate) orderConditions.push(gte(orders.event_start_date, fromDate));
        if (toDate) orderConditions.push(lte(orders.event_start_date, toDate));

        const orderRows = await db
            .select({
                issued_at: orderIssuedAt,
                order_ref: orders.order_id,
                order_status: orders.order_status,
                order_updated_at: orders.updated_at,
                event_start_date: orders.event_start_date,
                event_end_date: orders.event_end_date,
                venue_name: orders.venue_name,
                job_number: orders.job_number,
                po_number: orders.po_number,
                contact_name: orders.contact_name,
                city_name: cities.name,
                musketeer_name: users.name,
                musketeer_email: users.email,
                brand_name: brands.name,
                company_name: companies.name,
                item_quantity: orderItems.quantity,
                item_asset_name: orderItems.asset_name,
                family_name: assetFamilies.name,
                family_item_code: assetFamilies.company_item_code,
                category_name: assetCategories.name,
            })
            .from(orderItems)
            .innerJoin(orders, eq(orderItems.order_id, orders.id))
            .leftJoin(users, eq(orders.created_by, users.id))
            .leftJoin(cities, eq(orders.venue_city_id, cities.id))
            .leftJoin(brands, eq(orders.brand_id, brands.id))
            .leftJoin(companies, eq(orders.company_id, companies.id))
            .leftJoin(assets, eq(orderItems.asset_id, assets.id))
            .leftJoin(assetFamilies, eq(assets.family_id, assetFamilies.id))
            .leftJoin(assetCategories, eq(assetFamilies.category_id, assetCategories.id))
            .where(and(...orderConditions))
            .orderBy(desc(orders.event_start_date));

        for (const r of orderRows) {
            rows.push({
                "Issued At": formatDate(r.issued_at ?? r.order_updated_at),
                "Entity Type": "ORDER",
                Reference: r.order_ref,
                "Entity Status": r.order_status,
                "Item Code": r.family_item_code ?? "",
                "Item Description": r.family_name ?? r.item_asset_name ?? "",
                Category: r.category_name ?? "",
                "Requested Qty": String(r.item_quantity),
                "Delivered Qty": String(r.item_quantity),
                "Line Status": "DELIVERED",
                Venue: r.venue_name ?? "",
                City: r.city_name ?? "",
                Musketeer: r.musketeer_name ?? "",
                "Musketeer Email": r.musketeer_email ?? "",
                Company: r.company_name ?? "",
                Purpose: buildOrderPurpose({
                    contact_name: r.contact_name,
                    job_number: r.job_number,
                    po_number: r.po_number,
                    event_start_date: r.event_start_date,
                    event_end_date: r.event_end_date,
                    brand_name: r.brand_name,
                }),
                "Event Start": formatDate(r.event_start_date),
                "Event End": formatDate(r.event_end_date),
            });
        }
    }

    if (includeSPs) {
        const spConditions: any[] = [eq(selfPickups.platform_id, platformId)];
        if (scope !== "all") {
            spConditions.push(inArray(selfPickups.self_pickup_status, ISSUANCE_SP_STATUSES as any));
        }
        if (scopedCompanyId) spConditions.push(eq(selfPickups.company_id, scopedCompanyId));
        if (created_by) spConditions.push(eq(selfPickups.created_by, created_by));
        // For SPs we filter by pickup_window.start (JSONB). Cast to timestamptz.
        if (fromDate)
            spConditions.push(
                sql`(${selfPickups.pickup_window}->>'start')::timestamptz >= ${fromDate.toISOString()}`
            );
        if (toDate)
            spConditions.push(
                sql`(${selfPickups.pickup_window}->>'start')::timestamptz <= ${toDate.toISOString()}`
            );

        const spRows = await db
            .select({
                issued_at: spIssuedAt,
                sp_ref: selfPickups.self_pickup_id,
                sp_status: selfPickups.self_pickup_status,
                sp_updated_at: selfPickups.updated_at,
                pickup_window: selfPickups.pickup_window,
                job_number: selfPickups.job_number,
                po_number: selfPickups.po_number,
                collector_name: selfPickups.collector_name,
                collector_phone: selfPickups.collector_phone,
                musketeer_name: users.name,
                musketeer_email: users.email,
                brand_name: brands.name,
                company_name: companies.name,
                item_quantity: selfPickupItems.quantity,
                item_scanned_quantity: selfPickupItems.scanned_quantity,
                item_skipped: selfPickupItems.skipped,
                item_added_midflow: selfPickupItems.added_midflow,
                item_partial_reason: selfPickupItems.partial_reason,
                item_asset_name: selfPickupItems.asset_name,
                family_name: assetFamilies.name,
                family_item_code: assetFamilies.company_item_code,
                category_name: assetCategories.name,
            })
            .from(selfPickupItems)
            .innerJoin(selfPickups, eq(selfPickupItems.self_pickup_id, selfPickups.id))
            .leftJoin(users, eq(selfPickups.created_by, users.id))
            .leftJoin(brands, eq(selfPickups.brand_id, brands.id))
            .leftJoin(companies, eq(selfPickups.company_id, companies.id))
            .leftJoin(assets, eq(selfPickupItems.asset_id, assets.id))
            .leftJoin(assetFamilies, eq(assets.family_id, assetFamilies.id))
            .leftJoin(assetCategories, eq(assetFamilies.category_id, assetCategories.id))
            .where(and(...spConditions))
            .orderBy(desc(selfPickups.created_at));

        for (const r of spRows) {
            const delivered =
                r.item_scanned_quantity == null ? r.item_quantity : r.item_scanned_quantity;
            const lineStatus = deriveSpStatus({
                quantity: r.item_quantity,
                scanned_quantity: r.item_scanned_quantity,
                skipped: r.item_skipped,
                added_midflow: r.item_added_midflow,
            });
            const pw = r.pickup_window as { start?: string; end?: string } | null;
            rows.push({
                "Issued At": formatDate(r.issued_at ?? r.sp_updated_at),
                "Entity Type": "SELF_PICKUP",
                Reference: r.sp_ref,
                "Entity Status": r.sp_status,
                "Item Code": r.family_item_code ?? "",
                "Item Description": r.family_name ?? r.item_asset_name ?? "",
                Category: r.category_name ?? "",
                "Requested Qty": String(r.item_quantity),
                "Delivered Qty": String(delivered),
                "Line Status": lineStatus,
                Venue: "",
                City: "",
                Musketeer: r.musketeer_name ?? "",
                "Musketeer Email": r.musketeer_email ?? "",
                Company: r.company_name ?? "",
                Purpose: buildSpPurpose({
                    collector_name: r.collector_name,
                    collector_phone: r.collector_phone,
                    job_number: r.job_number,
                    po_number: r.po_number,
                    brand_name: r.brand_name,
                }),
                "Event Start": pw?.start ? formatDate(pw.start) : "",
                "Event End": pw?.end ? formatDate(pw.end) : "",
            });
        }
    }

    // Sort combined rows by Issued At desc for a single flat log.
    rows.sort((a, b) => (b["Issued At"] ?? "").localeCompare(a["Issued At"] ?? ""));

    return Papa.unparse(rows);
};

/**
 * Per-family stock movement export — one row per movement in the family's ledger.
 *
 * Source: `stock_movements` joined by `asset_family_id` OR via assets.family_id (stock
 * movements may be stored at either level depending on write path).
 * Audience: ops (ADMIN/LOGISTICS). Gated by STOCK_MOVEMENTS_READ.
 *
 * Columns match the on-screen audit ledger + linkable entity ref.
 */
const exportFamilyStockMovementsService = async (
    familyId: string,
    query: import("./export.interfaces").ExportStockMovementsQuery,
    _user: AuthUser,
    platformId: string
): Promise<{ csv: string; familyName: string }> => {
    const family = await db.query.assetFamilies.findFirst({
        where: and(eq(assetFamilies.id, familyId), eq(assetFamilies.platform_id, platformId)),
        columns: { id: true, name: true },
    });
    if (!family) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset family not found");
    }

    const { fromDate, toDate } = parseDateRange({
        date_from: query.date_from,
        date_to: query.date_to,
    });

    // Union by family_id OR (asset.family_id = familyId) to cover both write paths.
    // Today most rows carry asset_id; joining via assets.family_id is the reliable path.
    const conditions: any[] = [
        eq(stockMovements.platform_id, platformId),
        sql`(${stockMovements.asset_family_id} = ${familyId} OR ${assets.family_id} = ${familyId})`,
    ];
    if (query.movement_type) {
        conditions.push(sql`${stockMovements.movement_type}::text = ${query.movement_type}`);
    }
    if (fromDate) conditions.push(gte(stockMovements.created_at, fromDate));
    if (toDate) conditions.push(lte(stockMovements.created_at, toDate));

    const rows = await db
        .select({
            id: stockMovements.id,
            created_at: stockMovements.created_at,
            movement_type: stockMovements.movement_type,
            write_off_reason: stockMovements.write_off_reason,
            delta: stockMovements.delta,
            note: stockMovements.note,
            linked_entity_type: stockMovements.linked_entity_type,
            linked_entity_id: stockMovements.linked_entity_id,
            asset_name: assets.name,
            created_by_name: users.name,
        })
        .from(stockMovements)
        .leftJoin(assets, eq(stockMovements.asset_id, assets.id))
        .leftJoin(users, eq(stockMovements.created_by, users.id))
        .where(and(...conditions))
        .orderBy(desc(stockMovements.created_at));

    // Resolve human-readable ref per linked entity.
    const orderIds = new Set<string>();
    const spIds = new Set<string>();
    for (const r of rows) {
        if (!r.linked_entity_id || !r.linked_entity_type) continue;
        if (r.linked_entity_type === "ORDER") orderIds.add(r.linked_entity_id);
        if (r.linked_entity_type === "SELF_PICKUP") spIds.add(r.linked_entity_id);
    }

    const orderRefMap = new Map<string, string>();
    if (orderIds.size > 0) {
        const ordersForRef = await db
            .select({ id: orders.id, ref: orders.order_id })
            .from(orders)
            .where(inArray(orders.id, [...orderIds]));
        ordersForRef.forEach((o) => orderRefMap.set(o.id, o.ref));
    }

    const spRefMap = new Map<string, string>();
    if (spIds.size > 0) {
        const spsForRef = await db
            .select({ id: selfPickups.id, ref: selfPickups.self_pickup_id })
            .from(selfPickups)
            .where(inArray(selfPickups.id, [...spIds]));
        spsForRef.forEach((s) => spRefMap.set(s.id, s.ref));
    }

    const csvRows = rows.map((r) => {
        let linkedRef = "";
        if (r.linked_entity_type === "ORDER" && r.linked_entity_id) {
            linkedRef = orderRefMap.get(r.linked_entity_id) ?? r.linked_entity_id;
        } else if (r.linked_entity_type === "SELF_PICKUP" && r.linked_entity_id) {
            linkedRef = spRefMap.get(r.linked_entity_id) ?? r.linked_entity_id;
        }
        return {
            "Movement ID": r.id,
            Date: formatDate(r.created_at),
            Family: family.name,
            Asset: r.asset_name ?? "",
            "Movement Type": r.movement_type,
            "Write-off Reason": r.write_off_reason ?? "",
            Delta: String(r.delta),
            Note: r.note ?? "",
            "Linked Entity Type": r.linked_entity_type ?? "",
            "Linked Entity Ref": linkedRef,
            "Created By": r.created_by_name ?? "",
        };
    });

    return { csv: Papa.unparse(csvRows), familyName: family.name };
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
    exportWorkSummaryService,
    exportClientIssuanceLogService,
    exportFamilyStockMovementsService,
};
