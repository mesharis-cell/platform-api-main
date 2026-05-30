/**
 * The report registry — single source of truth. Routes, admin/client/warehouse
 * cards, and the CLI wrappers all derive from this array.
 */
import { ReportDefinition } from "./types";

import { issuanceReport } from "./definitions/issuance";
import { stockMovementsReport } from "./definitions/stock-movements";
import { currentStockReport } from "./definitions/current-stock";
import { assetUtilizationReport } from "./definitions/asset-utilization";
import { assetCatalogueReport } from "./definitions/asset-catalogue";
import { ordersReport } from "./definitions/orders";
import { orderHistoryReport } from "./definitions/order-history";
import { inboundLogReport } from "./definitions/inbound-log";
import { overdueReturnsReport } from "./definitions/overdue-returns";
import { workSummaryReport } from "./definitions/work-summary";
import { accountsReconciliationReport } from "./definitions/accounts-reconciliation";
import { revenueReport } from "./definitions/revenue";
import { costReport } from "./definitions/cost";

export const reportRegistry: ReportDefinition[] = [
    // INVENTORY
    currentStockReport,
    stockMovementsReport,
    assetUtilizationReport,
    assetCatalogueReport,
    // OPERATIONS
    issuanceReport,
    ordersReport,
    orderHistoryReport,
    inboundLogReport,
    overdueReturnsReport,
    workSummaryReport,
    // FINANCIAL (admin-only)
    accountsReconciliationReport,
    revenueReport,
    costReport,
];

export function getReport(key: string): ReportDefinition | undefined {
    return reportRegistry.find((r) => r.key === key);
}
