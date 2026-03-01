import { actionButton, footer, infoBox, infoRow, wrap } from "./base";

export const lineItemRequestSubmittedAdmin = {
    subject: (payload: Record<string, unknown>) =>
        `Line item request submitted: ${String(payload.line_item_request_id || "")}`,
    html: (payload: Record<string, unknown>) => {
        const requestId = String(payload.line_item_request_id || "");
        const requestUrl = String(payload.request_url || payload.order_url || "");
        return wrap(`
            <h1 style="margin: 0 0 12px; font-size: 22px; color: #111827;">New Line Item Request</h1>
            <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">
                Logistics submitted a new line item request for review.
            </p>
            ${infoBox(
                [
                    infoRow("Request ID", requestId || "—"),
                    infoRow("Entity Type", String(payload.purpose_type || "—")),
                    infoRow("Description", String(payload.description || "—")),
                    infoRow("Category", String(payload.category || "—")),
                    infoRow("Quantity", String(payload.quantity || "—")),
                    infoRow("Unit", String(payload.unit || "—")),
                    infoRow("Unit Rate", `${String(payload.unit_rate || "0")} AED`),
                    infoRow("Notes", String(payload.notes || "—")),
                ].join(""),
                "#f8fafc",
                "#0ea5e9"
            )}
            ${requestUrl ? actionButton("Open Request", requestUrl) : ""}
            ${footer()}
        `);
    },
};
