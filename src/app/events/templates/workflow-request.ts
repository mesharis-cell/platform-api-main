import { actionButton, footer, infoBox, infoRow, wrap } from "./base";

export const workflowRequestSubmittedAdmin = {
    subject: (payload: Record<string, unknown>) =>
        `Workflow request submitted: ${String(payload.title || payload.workflow_code || "")}`,
    html: (payload: Record<string, unknown>) => {
        const requestUrl = String(payload.request_url || payload.order_url || "");
        return wrap(`
            <h1 style="margin: 0 0 12px; font-size: 22px; color: #111827;">New Internal Workflow Request</h1>
            <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">
                Logistics requested internal support on a commercial workflow.
            </p>
            ${infoBox(
                [
                    infoRow("Workflow", String(payload.workflow_code || "—")),
                    infoRow("Status", String(payload.workflow_status || "REQUESTED")),
                    infoRow("Title", String(payload.title || "—")),
                    infoRow("Description", String(payload.description || "—")),
                    infoRow("Company", String(payload.company_name || "—")),
                    infoRow("Reference", String(payload.entity_id_readable || "—")),
                ].join(""),
                "#f8fafc",
                "#ea580c"
            )}
            ${requestUrl ? actionButton("Open Related Record", requestUrl) : ""}
            ${footer()}
        `);
    },
};
