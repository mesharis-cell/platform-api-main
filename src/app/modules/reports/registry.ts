/**
 * The report registry — single source of truth. Each definition file under
 * ./definitions registers itself here. Routes, admin/client cards, and the CLI
 * wrappers all derive from this array.
 *
 * NOTE: definition imports are added as each lands (see git history of this file).
 */
import { ReportDefinition } from "./types";
import { issuanceReport } from "./definitions/issuance";

export const reportRegistry: ReportDefinition[] = [issuanceReport];

export function getReport(key: string): ReportDefinition | undefined {
    return reportRegistry.find((r) => r.key === key);
}
