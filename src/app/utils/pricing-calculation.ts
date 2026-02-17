import { calculatePricingSummary } from "./pricing-engine";

type GetRequestPricingToShowClientPayload = {
    base_ops_total: string;
    line_items: {
        catalog_total: string;
        custom_total: string;
    };
    margin: {
        percent: number;
    };
};

export const getRequestPricingToShowClient = (
    pricing: GetRequestPricingToShowClientPayload
): {
    logistics_sub_total: string;
    service_fee: string;
    final_total: string;
} => {
    const baseOpsTotal = Number(pricing.base_ops_total);
    const catalogAmount = Number((pricing.line_items as any).catalog_total);
    const customTotal = Number((pricing.line_items as any).custom_total);
    const marginPercent = Number((pricing.margin as any).percent);
    const pricingSummary = calculatePricingSummary({
        base_ops_total: baseOpsTotal,
        catalog_total: catalogAmount,
        custom_total: customTotal,
        margin_percent: marginPercent,
    });

    return {
        logistics_sub_total: pricingSummary.sell_lines.base_ops_total.toFixed(2),
        service_fee: pricingSummary.service_fee.toFixed(2),
        final_total: pricingSummary.final_total.toFixed(2),
    };
};
