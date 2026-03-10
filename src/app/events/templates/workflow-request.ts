import { actionButton, footer, infoBox, infoRow, wrap } from "./base";

const buildWorkflowTemplate = (
    heading: string,
    intro: string,
    accent: string,
    statusLabel: string
) => ({
    subject: (payload: Record<string, unknown>) =>
        `${heading}: ${String(payload.title || payload.workflow_label || payload.workflow_code || "")}`,
    html: (payload: Record<string, unknown>) => {
        const requestUrl = String(payload.request_url || payload.order_url || "");
        return wrap(`
            <h1 style="margin: 0 0 12px; font-size: 22px; color: #111827;">${heading}</h1>
            <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">${intro}</p>
            ${infoBox(
                [
                    infoRow(
                        "Workflow",
                        String(payload.workflow_label || payload.workflow_code || "—")
                    ),
                    infoRow("Family", String(payload.workflow_family || "—")),
                    infoRow("Status", String(payload.workflow_status || statusLabel)),
                    infoRow("Lifecycle", String(payload.lifecycle_state || "—")),
                    infoRow("Title", String(payload.title || "—")),
                    infoRow("Description", String(payload.description || "—")),
                    infoRow("Company", String(payload.company_name || "—")),
                    infoRow("Reference", String(payload.entity_id_readable || "—")),
                    infoRow("Changed From", String(payload.old_status || "—")),
                    infoRow(
                        "Changed To",
                        String(payload.new_status || payload.workflow_status || "—")
                    ),
                ].join(""),
                "#f8fafc",
                accent
            )}
            ${requestUrl ? actionButton("Open Related Record", requestUrl) : ""}
            ${footer()}
        `);
    },
});

export const workflowRequestSubmittedAdmin = buildWorkflowTemplate(
    "Workflow Submitted",
    "A new internal workflow request has been created.",
    "#ea580c",
    "REQUESTED"
);

export const workflowRequestSubmittedLogistics = buildWorkflowTemplate(
    "Workflow Submitted",
    "A workflow request was created and is now visible to logistics.",
    "#2563eb",
    "REQUESTED"
);

export const workflowRequestStatusChangedAdmin = buildWorkflowTemplate(
    "Workflow Status Changed",
    "An internal workflow request changed status.",
    "#7c3aed",
    "UPDATED"
);

export const workflowRequestStatusChangedLogistics = buildWorkflowTemplate(
    "Workflow Status Changed",
    "An internal workflow request changed status.",
    "#0f766e",
    "UPDATED"
);

export const workflowRequestCompletedAdmin = buildWorkflowTemplate(
    "Workflow Completed",
    "An internal workflow request reached a completed state.",
    "#15803d",
    "COMPLETED"
);

export const workflowRequestCompletedLogistics = buildWorkflowTemplate(
    "Workflow Completed",
    "An internal workflow request reached a completed state.",
    "#15803d",
    "COMPLETED"
);

export const workflowRequestCancelledAdmin = buildWorkflowTemplate(
    "Workflow Cancelled",
    "An internal workflow request was cancelled.",
    "#b91c1c",
    "CANCELLED"
);

export const workflowRequestCancelledLogistics = buildWorkflowTemplate(
    "Workflow Cancelled",
    "An internal workflow request was cancelled.",
    "#b91c1c",
    "CANCELLED"
);
