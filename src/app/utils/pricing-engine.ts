type PricingSummaryInput = {
    base_ops_total: number;
    transport_rate?: number;
    catalog_total?: number;
    custom_total?: number;
    margin_percent: number;
};

type PricingSummary = {
    sell_lines: {
        base_ops_total: number;
        transport_total: number;
        catalog_total: number;
        custom_total: number;
    };
    service_fee: number;
    logistics_sub_total: number;
    base_sub_total: number;
    margin_amount: number;
    final_total: number;
};

const toNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const roundCurrency = (value: number) =>
    Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export const applyMarginPerLine = (baseValue: number, marginPercent: number) =>
    roundCurrency(toNumber(baseValue) * (1 + toNumber(marginPercent) / 100));

export const calculatePricingSummary = (input: PricingSummaryInput): PricingSummary => {
    const baseOpsTotal = toNumber(input.base_ops_total);
    const transportRate = toNumber(input.transport_rate);
    const catalogTotal = toNumber(input.catalog_total);
    const customTotal = toNumber(input.custom_total);
    const marginPercent = toNumber(input.margin_percent);

    const sellBaseOps = applyMarginPerLine(baseOpsTotal, marginPercent);
    const sellTransport = applyMarginPerLine(transportRate, marginPercent);
    const sellCatalog = applyMarginPerLine(catalogTotal, marginPercent);
    const sellCustom = applyMarginPerLine(customTotal, marginPercent);

    const serviceFee = roundCurrency(sellCatalog + sellCustom);
    const logisticsSubTotal = roundCurrency(baseOpsTotal + transportRate + catalogTotal);
    const baseSubTotal = roundCurrency(baseOpsTotal + transportRate + catalogTotal + customTotal);
    const finalTotal = roundCurrency(sellBaseOps + sellTransport + sellCatalog + sellCustom);
    const marginAmount = roundCurrency(finalTotal - baseSubTotal);

    return {
        sell_lines: {
            base_ops_total: sellBaseOps,
            transport_total: sellTransport,
            catalog_total: sellCatalog,
            custom_total: sellCustom,
        },
        service_fee: serviceFee,
        logistics_sub_total: logisticsSubTotal,
        base_sub_total: baseSubTotal,
        margin_amount: marginAmount,
        final_total: finalTotal,
    };
};
