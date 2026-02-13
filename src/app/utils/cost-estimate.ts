import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { cities, companies, orderItems, prices, orders, lineItems } from "../../db/schema";
import { checkFileExists, deleteFileFromS3, uploadPDFToS3 } from "../services/s3.service";
import { renderCostEstimatePDF } from "./cost-estimate-pdf";
import CustomizedError from "../error/customized-error";
import httpStatus from "http-status";
import { AuthUser } from "../interface/common";
import { applyMarginPerLine, calculatePricingSummary, roundCurrency } from "./pricing-engine";

// ------------------------------ COST ESTIMATE GENERATOR ------------------------------------
export const costEstimateGenerator = async (
    orderId: string,
    platformId: string,
    user: AuthUser,
    regenerate: boolean = false
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
                warehouse_ops_rate: prices.warehouse_ops_rate,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                transport: prices.transport,
                line_items: prices.line_items,
                margin: prices.margin,
                final_total: prices.final_total,
                calculated_at: prices.calculated_at,
            },
            venue_city: {
                name: cities.name,
            },
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .leftJoin(prices, eq(orders.order_pricing_id, prices.id))
        .leftJoin(cities, eq(orders.venue_city_id, cities.id))
        .leftJoin(lineItems, eq(orders.id, lineItems.order_id))
        .where(and(eq(orders.id, orderId), eq(orders.platform_id, platformId)))
        .limit(1);

    const order = result.order;
    const company = result.company;
    const orderPricing = result.order_pricing;
    const venueCity = result.venue_city;

    if (!order) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Order not found to generate cost estimate"
        );
    }
    if (!company) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Company not found for this order to generate cost estimate"
        );
    }
    if (!orderPricing) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Order pricing not found for this order to generate cost estimate"
        );
    }
    if (!venueCity) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Venue city not found for this order to generate cost estimate"
        );
    }

    const ALLOWED_COST_ESTIMATE_STATUSES = ["PENDING_APPROVAL", "QUOTED"] as const;
    if (!ALLOWED_COST_ESTIMATE_STATUSES.includes(order.order_status as any)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order must be in ${ALLOWED_COST_ESTIMATE_STATUSES.join(" or ")} status. Current status: ${order.order_status}`
        );
    }

    const orderLineItems = await db.select().from(lineItems).where(eq(lineItems.order_id, orderId));

    const venueLocation = order.venue_location as any;

    const baseOpsTotal = Number(orderPricing.base_ops_total);
    const transportRate = Number((orderPricing.transport as any).final_rate);
    const catalogAmount = Number((orderPricing.line_items as any).catalog_total);
    const customTotal = Number((orderPricing.line_items as any).custom_total);
    const marginPercent = Number((orderPricing.margin as any).percent);
    const pricingSummary = calculatePricingSummary({
        base_ops_total: baseOpsTotal,
        transport_rate: transportRate,
        catalog_total: catalogAmount,
        custom_total: customTotal,
        margin_percent: marginPercent,
    });

    const orderItemsResult = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.order_id, orderId));

    const calculatedOrderLineItems = orderLineItems.map((item) => {
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

    // Calculate line items subtotal
    const lineItemsSubTotal = calculatedOrderLineItems.reduce(
        (sum, item) => sum + Number(item.total),
        0
    );

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
            logistics_base_price: pricingSummary.sell_lines.base_ops_total.toFixed(2),
            transport_rate: pricingSummary.sell_lines.transport_total.toFixed(2),
            service_fee: pricingSummary.service_fee.toFixed(2),
            final_total_price: pricingSummary.final_total.toFixed(2),
            show_breakdown: !!orderPricing, // Show breakdown if using new pricing
        },
        items: orderItemsResult.map((item) => ({
            asset_name: item.asset_name,
            quantity: item.quantity,
            handling_tags: item.handling_tags as any,
            from_collection_name: item.from_collection_name || "N/A",
        })),
        line_items: calculatedOrderLineItems,
        line_items_sub_total: lineItemsSubTotal,
    };

    // Build S3 key using order_id
    const key = `cost-estimates/${costEstimateData.company_name.replace(/\s/g, "-").toLowerCase()}/${costEstimateData.order_id}.pdf`;

    // Check if cost estimate already exists
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

    // Generate PDF
    const pdfBuffer = await renderCostEstimatePDF({
        ...costEstimateData,
        estimate_date: new Date(),
    });

    // Upload PDF to S3 (overwrites if exists)
    const pdfUrl = await uploadPDFToS3(pdfBuffer, costEstimateData.order_id, key);

    return {
        estimate_pdf_url: pdfUrl,
        pdf_buffer: pdfBuffer,
    };
};
