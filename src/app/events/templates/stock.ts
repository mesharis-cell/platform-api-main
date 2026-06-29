import { EmailTemplate } from "./index";
import { footer, infoBox, infoRow, wrap } from "./base";

const p = (payload: Record<string, unknown>) => payload as Record<string, any>;

// Post-squash: payload uses `group_name` (denormalized off the asset row, may be
// null for raw assets) instead of `family_name`. Templates fall back to
// asset_name when group_name is absent.

// ─── stock_below_threshold_admin ──────────────────────────────────────────────
export const stockBelowThresholdAdmin: EmailTemplate = {
    subject: (payload) => `Low Stock Alert: ${p(payload).group_name || p(payload).asset_name}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #b45309;">Low Stock Alert</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Inventory has dropped below the configured threshold for this item.</p>
            ${infoBox(
                `
                ${infoRow("Group", d.group_name || "—")}
                ${infoRow("Asset", d.asset_name || "—")}
                ${infoRow("Available", `${d.available_quantity ?? "—"} units`)}
                ${infoRow("Threshold", `${d.low_stock_threshold ?? "—"} units`)}
            `,
                "#fef3c7",
                "#f59e0b"
            )}
            <p style="margin: 16px 0; color: #374151;">Review the asset and consider a stock adjustment or restocking.</p>
            ${footer()}
        `);
    },
};

// ─── stock_below_threshold_logistics ──────────────────────────────────────────
export const stockBelowThresholdLogistics: EmailTemplate = {
    subject: (payload) => `Low Stock: ${p(payload).group_name || p(payload).asset_name}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #b45309;">Low Stock — Action Needed</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Warehouse availability for this item is below threshold.</p>
            ${infoBox(
                `
                ${infoRow("Group", d.group_name || "—")}
                ${infoRow("Asset", d.asset_name || "—")}
                ${infoRow("Available", `${d.available_quantity ?? "—"} units`)}
                ${infoRow("Threshold", `${d.low_stock_threshold ?? "—"} units`)}
            `,
                "#fef3c7",
                "#f59e0b"
            )}
            ${footer()}
        `);
    },
};

// ─── orphan_bookings_detected_admin ───────────────────────────────────────────
// Internal/ops integrity alert. A booking row exists IFF the hold is active —
// any row pointing at a closed/cancelled/deleted parent is a booking-engine bug
// that silently over-counts held inventory. This surfaces it for investigation.
export const orphanBookingsDetectedAdmin: EmailTemplate = {
    subject: (payload) =>
        `Booking integrity alert: ${p(payload).orphan_count} orphaned booking(s) detected`,
    html: (payload) => {
        const d = p(payload);
        const sample: any[] = Array.isArray(d.sample) ? d.sample : [];
        const rows = sample
            .map(
                (s) =>
                    `${infoRow(
                        `${s.parent_type ?? "?"} ${s.parent_readable || s.parent_id || "—"}`,
                        `${s.parent_deleted ? "DELETED" : s.parent_status || "—"} · booking ${
                            s.booking_id || "—"
                        }`
                    )}`
            )
            .join("");
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #b91c1c;">Booking Integrity Alert</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">
                ${d.orphan_count ?? "—"} asset booking(s) reference a closed, cancelled, or deleted parent.
                A booking row should exist only while its hold is active — these orphans over-count held
                inventory and indicate a booking-engine integrity issue. Investigate and reconcile.
            </p>
            ${infoBox(rows || infoRow("Sample", "—"), "#fee2e2", "#ef4444")}
            <p style="margin: 16px 0; font-size: 13px; color: #6b7280;">Showing up to a capped sample; total orphan count is ${d.orphan_count ?? "—"}.</p>
            ${footer()}
        `);
    },
};
