import { and, asc, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import httpStatus from "http-status";
import Papa from "papaparse";
import { db } from "../../../db";
import {
    brands,
    companies,
    cities,
    orderItems,
    orders,
    prices,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import queryValidator from "../../utils/query-validator";
import { ExportOrderQuery } from "./export.interfaces";
import { orderQueryValidationConfig, orderSortableFields } from "../order/order.utils";

const exportOrdersService = async (
    query: ExportOrderQuery,
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

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(orderQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(orderQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Build WHERE conditions
    const conditions: any[] = [eq(orders.platform_id, platformId)];

    // Role-based filtering temporarily removed as per user request/context
    // if (user.role === "CLIENT") {
    //     if (user.company_id) {
    //         conditions.push(eq(orders.company_id, user.company_id));
    //     } else {
    //         throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
    //     }
    // }

    if (company_id) {
        conditions.push(eq(orders.company_id, company_id));
    }

    if (brand_id) {
        conditions.push(eq(orders.brand_id, brand_id));
    }

    if (order_status) {
        queryValidator(orderQueryValidationConfig, "order_status", order_status);
        conditions.push(eq(orders.order_status, order_status as any));
    }

    if (financial_status) {
        queryValidator(orderQueryValidationConfig, "financial_status", financial_status);
        conditions.push(eq(orders.financial_status, financial_status as any));
    }

    if (date_from) {
        const fromDate = new Date(date_from);
        if (isNaN(fromDate.getTime())) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date_from format");
        }
        conditions.push(gte(orders.created_at, fromDate));
    }

    if (date_to) {
        const toDate = new Date(date_to);
        if (isNaN(toDate.getTime())) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid date_to format");
        }
        conditions.push(lte(orders.created_at, toDate));
    }

    // Step 2c: Search functionality
    if (search_term) {
        const searchConditions = [
            ilike(orders.order_id, `%${search_term}%`),
            ilike(orders.contact_name, `%${search_term}%`),
            ilike(orders.venue_name, `%${search_term}%`),
            // Subquery for asset names in orderItems
            sql`EXISTS (
                SELECT 1 FROM ${orderItems}
                WHERE ${orderItems.order_id} = ${orders.id}
                AND ${orderItems.asset_name} ILIKE ${`%${search_term}%`}
            )`,
        ];
        conditions.push(sql`(${sql.join(searchConditions, sql` OR `)})`);
    }

    // Step 3: Determine sort field
    const sortField = sort_by ? orderSortableFields[sort_by] : orders.created_at;
    const sortDirection = sort_order === "asc" ? asc(sortField) : desc(sortField);

    // Step 4: Fetch orders with details and line items
    const results = await db
        .select({
            order: orders,
            company: {
                name: companies.name,
            },
            brand: {
                name: brands.name,
            },
            venue_city: {
                name: cities.name,
            },
            pricing: {
                final_total: prices.final_total,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                transport: prices.transport,
            },
            item: orderItems, // Select all item fields
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(brands, eq(orders.brand_id, brands.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .leftJoin(cities, eq(orders.venue_city_id, cities.id))
        .leftJoin(orderItems, eq(orders.id, orderItems.order_id)) // Join line items
        .where(and(...conditions))
        .orderBy(sortDirection);

    // Step 5: Fetch item counts for each order - REMOVED as per new requirement for one row per item
    // const orderIds = results.map((r) => r.order.id);
    // let itemCounts: Record<string, number> = {};

    // if (orderIds.length > 0) {
    //     const itemResults = await db
    //         .select({
    //             order_id: orderItems.order_id,
    //             count: sql<number>`count(*)`,
    //         })
    //         .from(orderItems)
    //         .where(inArray(orderItems.order_id, orderIds))
    //         .groupBy(orderItems.order_id);

    //     itemResults.forEach((row) => {
    //         itemCounts[row.order_id] = Number(row.count);
    //     });
    // }

    // Step 6: Transform data for CSV
    const csvData = results.map((row) => {
        const { order, company, brand, venue_city, pricing, item } = row;

        // Helper to format date
        const formatDate = (date: Date | null) =>
            date ? new Date(date).toLocaleDateString() : "";

        return {
            "Order ID": order.order_id,
            "Job Number": order.job_number || "",
            "Status": order.order_status,
            "Financial Status": order.financial_status,
            "Company": company?.name || "",
            "Brand": brand?.name || "",
            "Contact Name": order.contact_name,
            "Contact Email": order.contact_email,
            "Event Start": formatDate(order.event_start_date),
            "Event End": formatDate(order.event_end_date),
            "Venue Name": order.venue_name,
            "Venue City": venue_city?.name || "",

            // Order Totals
            "Order Total Volume (m3)": (order.calculated_totals as any)?.volume || "0",
            "Order Total Weight (kg)": (order.calculated_totals as any)?.weight || "0",
            "Order Base Ops Total": pricing?.base_ops_total || "0",
            "Order Logistics Subtotal": pricing?.logistics_sub_total || "0",
            "Order Final Total": pricing?.final_total || "0",

            // Item Details
            "Item Name": item?.asset_name || "",
            "Item Quantity": item?.quantity || "",
            "Item Volume (m3)": item?.total_volume || "",
            "Item Weight (kg)": item?.total_weight || "",
            "Item Condition Notes": item?.condition_notes || "",

            "Created At": formatDate(order.created_at),
        };
    });

    // Step 7: Generate CSV
    return Papa.unparse(csvData);
};

export const ExportServices = {
    exportOrdersService,
};
