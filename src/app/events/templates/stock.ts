import { EmailTemplate } from "./index";
import { footer, infoBox, infoRow, wrap } from "./base";

const p = (payload: Record<string, unknown>) => payload as Record<string, any>;

// ─── stock_below_threshold_admin ──────────────────────────────────────────────
export const stockBelowThresholdAdmin: EmailTemplate = {
    subject: (payload) => `Low Stock Alert: ${p(payload).family_name || p(payload).asset_name}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #b45309;">Low Stock Alert</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Inventory has dropped below the configured threshold for this family.</p>
            ${infoBox(
                `
                ${infoRow("Family", d.family_name || "—")}
                ${infoRow("Asset", d.asset_name || "—")}
                ${infoRow("Available", `${d.available_quantity ?? "—"} units`)}
                ${infoRow("Threshold", `${d.low_stock_threshold ?? "—"} units`)}
            `,
                "#fef3c7",
                "#f59e0b"
            )}
            <p style="margin: 16px 0; color: #374151;">Review the family and consider a stock adjustment or restocking.</p>
            ${footer()}
        `);
    },
};

// ─── stock_below_threshold_logistics ──────────────────────────────────────────
export const stockBelowThresholdLogistics: EmailTemplate = {
    subject: (payload) => `Low Stock: ${p(payload).family_name || p(payload).asset_name}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #b45309;">Low Stock — Action Needed</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">Warehouse availability for this family is below threshold.</p>
            ${infoBox(
                `
                ${infoRow("Family", d.family_name || "—")}
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
