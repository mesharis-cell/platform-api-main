import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import { orders, prices } from "../../../db/schema";
import httpStatus from "http-status";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { UpdatePriceForTransportPayload } from "./price.interfaces";
import { costEstimateGenerator } from "../../utils/cost-estimate";

const updatePriceForTransport = async (
    id: string,
    platformId: string,
    user: AuthUser,
    payload: UpdatePriceForTransportPayload
) => {
    const { transport_rate } = payload;

    // Step 1: Fetch price details
    const [priceRecord] = await db
        .select()
        .from(prices)
        .where(and(eq(prices.id, id), eq(prices.platform_id, platformId)));

    if (!priceRecord) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Pricing details not found");
    }

    const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.order_pricing_id, priceRecord.id))
        .limit(1);

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found for this pricing");
    }

    // Step 2: Recalculate new pricing details
    const baseOpsTotal = Number(priceRecord.base_ops_total);
    const logisticsSubTotal =
        baseOpsTotal + transport_rate + Number((priceRecord.line_items as any).catalog_total || 0);
    const marginAmount = logisticsSubTotal * (Number((priceRecord.margin as any).percent) / 100);
    const finalTotal =
        logisticsSubTotal +
        marginAmount +
        Number((priceRecord.line_items as any).custom_total || 0);

    const pricingDetails = {
        logistics_sub_total: logisticsSubTotal.toFixed(2),
        transport: {
            system_rate: transport_rate,
            final_rate: transport_rate,
        },
        margin: {
            percent: Number((priceRecord.margin as any).percent),
            amount: marginAmount.toFixed(2),
            is_override: (priceRecord.margin as any).is_override,
            override_reason: (priceRecord.margin as any).override_reason,
        },
        final_total: finalTotal.toFixed(2),
        calculated_at: new Date(),
        calculated_by: user.id,
    };

    // Step 3: Update price details
    const [updatedPrice] = await db
        .update(prices)
        .set(pricingDetails)
        .where(eq(prices.id, id))
        .returning();

    if (
        [
            "QUOTED",
            "DECLINED",
            "CONFIRMED",
            "AWAITING_FABRICATION",
            "IN_PREPARATION",
            "READY_FOR_DELIVERY",
            "IN_TRANSIT",
            "DELIVERED",
            "IN_USE",
            "AWAITING_RETURN",
            "RETURN_IN_TRANSIT",
        ].includes(order.order_status)
    ) {
        await costEstimateGenerator(order.id, platformId, user, true);
    }

    return updatedPrice;
};

export const PriceServices = {
    updatePriceForTransport,
};
