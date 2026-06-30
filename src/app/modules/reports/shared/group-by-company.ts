/**
 * Shared all-companies grouping helper for the FINANCIAL reports that can run
 * platform-wide (accounts-reconciliation, revenue, cost). When a report runs in
 * all-companies mode its rows arrive ORDER BY company ASC, so consecutive rows
 * for the same company are adjacent — a single linear scan splits them into
 * per-company groups, each of which the report renders followed by a cached
 * per-company subtotal (and a final cached grand total).
 *
 * Generic over the row type via a `getCompany` selector so each report can map
 * its own shape (`r.company`, `r.company_name`, `d.raw.company`, …). The
 * totals-writer is deliberately NOT shared — column layouts differ per report,
 * so each report owns its own cached subtotal/grand-total row writer.
 */

/** A company group: the company name + the (already company-ordered) rows in it. */
export interface CompanyGroup<T> {
    company: string;
    rows: T[];
}

/**
 * Split a company-ordered list into consecutive same-company groups. Rows with a
 * null/empty company collapse under "—". Relies on the caller's ORDER BY company
 * ASC — does NOT sort (a stray out-of-order row would open a new group, which is
 * the correct, visible failure mode).
 */
export function groupByCompany<T>(
    list: T[],
    getCompany: (item: T) => string | null | undefined
): CompanyGroup<T>[] {
    const groups: CompanyGroup<T>[] = [];
    for (const item of list) {
        const name = getCompany(item) ?? "—";
        const last = groups[groups.length - 1];
        if (last && last.company === name) last.rows.push(item);
        else groups.push({ company: name, rows: [item] });
    }
    return groups;
}
