const toNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const roundCurrency = (value: number) =>
    Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;

export const applyMarginPerLine = (baseValue: number, marginPercent: number) =>
    roundCurrency(toNumber(baseValue) * (1 + toNumber(marginPercent) / 100));
