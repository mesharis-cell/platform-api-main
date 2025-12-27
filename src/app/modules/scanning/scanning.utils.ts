// Scanning utility functions

/**
 * Calculate scan progress for an order
 */
export const calculateScanProgress = (
    scannedQuantity: number,
    totalQuantity: number
): number => {
    if (totalQuantity === 0) return 0;
    return Math.round((scannedQuantity / totalQuantity) * 100);
};
