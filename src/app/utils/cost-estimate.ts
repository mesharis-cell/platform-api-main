import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { cities, companies, orderItems, orderPrices, orders } from "../../db/schema";
import { uploadPDFToS3 } from "../services/s3.service";
import { renderCostEstimatePDF } from "./cost-estimate-pdf";
import CustomizedError from "../error/customized-error";
import httpStatus from "http-status";
import { AuthUser } from "../interface/common";

// ------------------------------ COST ESTIMATE GENERATOR ------------------------------------
export const costEstimateGenerator = async (
    orderId: string,
    platformId: string,
    user: AuthUser
): Promise<{ estimate_pdf_url: string; pdf_buffer: Buffer }> => {
    const [result] = await db
        .select({
            order: orders,
            company: {
                id: companies.id,
                name: companies.name,
                platform_margin_percent: companies.platform_margin_percent,
                warehouse_ops_rate: companies.warehouse_ops_rate,
            },
            order_pricing: {
                warehouse_ops_rate: orderPrices.warehouse_ops_rate,
                base_ops_total: orderPrices.base_ops_total,
                logistics_sub_total: orderPrices.logistics_sub_total,
                transport: orderPrices.transport,
                line_items: orderPrices.line_items,
                margin: orderPrices.margin,
                final_total: orderPrices.final_total,
                calculated_at: orderPrices.calculated_at,
            },
            venue_city: {
                name: cities.name
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(orderPrices, eq(orders.order_pricing_id, orderPrices.id))
        .leftJoin(cities, eq(orders.venue_city_id, cities.id))
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)))
        .limit(1);

    const order = result.order;
    const company = result.company;
    const orderPricing = result.order_pricing;
    const venueCity = result.venue_city;

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found to generate cost estimate");
    }
    if (!company) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found for this order to generate cost estimate");
    }
    if (!orderPricing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order pricing not found for this order to generate cost estimate");
    }
    if (!venueCity) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Venue city not found for this order to generate cost estimate");
    }

    if (order.order_status !== "PENDING_APPROVAL") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order is not in PENDING_APPROVAL status. Current status: ${order.order_status}`
        );
    }

    const venueLocation = order.venue_location as any;

    const baseOpsTotal = Number(orderPricing.base_ops_total);
    const transportRate = Number((orderPricing.transport as any).final_rate);
    const catalogAmount = Number((orderPricing.line_items as any).catalog_total);
    const customTotal = Number((orderPricing.line_items as any).custom_total);
    const marginPercent = Number((orderPricing.margin as any).percent);
    const logisticsBasePrice = baseOpsTotal + (baseOpsTotal * (marginPercent / 100));
    const catalogTotal = catalogAmount + (catalogAmount * (marginPercent / 100));
    const transportRateWithMargin = transportRate + (transportRate * (marginPercent / 100));
    const serviceFee = catalogTotal + customTotal;
    const total = logisticsBasePrice + transportRateWithMargin + serviceFee;

    const orderItemsResult = await db.select().from(orderItems).where(eq(orderItems.order_id, orderId));

    const costEstimateData = {
        id: order.id,
        user_id: user.id,
        platform_id: order.platform_id,
        order_id: order.order_id,
        contact_name: order.contact_name,
        contact_email: order.contact_email,
        contact_phone: order.contact_phone,
        company_name: company?.name || "N/A",
        event_start_date: order.event_start_date,
        event_end_date: order.event_end_date,
        venue_name: order.venue_name,
        venue_country: venueLocation.country || "N/A",
        venue_city: venueCity?.name || "N/A",
        venue_address: venueLocation.address || "N/A",
        order_status: order.order_status,
        financial_status: order.financial_status,
        pricing: {
            logistics_base_price: String(logisticsBasePrice) || '0',
            transport_rate: String(transportRateWithMargin) || '0',
            service_fee: String(serviceFee) || '0',
            final_total_price: String(total) || '0',
            show_breakdown: !!orderPricing, // Show breakdown if using new pricing
        },
        items: orderItemsResult.map((item) => ({
            asset_name: item.asset_name,
            quantity: item.quantity,
            handling_tags: item.handling_tags as any,
            from_collection_name: item.from_collection_name || "N/A",
        })),
    };

    // Generate PDF
    const pdfBuffer = await renderCostEstimatePDF({
        ...costEstimateData,
        estimate_number: costEstimateData.order_id,
        estimate_date: new Date(),
    });

    // Build S3 key using order_id
    const key = `cost-estimates/${costEstimateData.company_name.replace(/\s/g, "-").toLowerCase()}/${costEstimateData.order_id}.pdf`;

    // Upload PDF to S3 (overwrites if exists)
    const pdfUrl = await uploadPDFToS3(pdfBuffer, costEstimateData.order_id, key);

    return {
        estimate_pdf_url: pdfUrl,
        pdf_buffer: pdfBuffer,
    };
};
