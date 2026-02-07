type GetRequestPricingToShowClientPayload = {
    base_ops_total: string;
    line_items: {
        catalog_total: string;
        custom_total: string;
    };
    margin: {
        percent: number;
    };
}

export const getRequestPricingToShowClient = (pricing: GetRequestPricingToShowClientPayload): {
    logistics_sub_total: string;
    service_fee: string;
    final_total: string;
} => {
    const baseOpsTotal = Number(pricing.base_ops_total);
    const catalogAmount = Number((pricing.line_items as any).catalog_total);
    const customTotal = Number((pricing.line_items as any).custom_total);
    const marginPercent = Number((pricing.margin as any).percent);
    const logisticsSubTotal = baseOpsTotal + (baseOpsTotal * (marginPercent / 100));
    const catalogTotal = catalogAmount + (catalogAmount * (marginPercent / 100));
    const serviceFee = catalogTotal + customTotal;
    const total = logisticsSubTotal + serviceFee;

    return {
        logistics_sub_total: String(logisticsSubTotal) || '0',
        service_fee: String(serviceFee) || '0',
        final_total: String(total) || '0',
    }
}