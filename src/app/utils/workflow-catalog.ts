export type WorkflowDefinitionCode = "ARTWORK_SUPPORT";
export type WorkflowLifecycleState = "OPEN" | "ACTIVE" | "DONE" | "CANCELLED";

export type WorkflowCatalogEntry = {
    code: WorkflowDefinitionCode;
    label: string;
    description: string;
    allowedEntityTypes: Array<"ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST">;
    requesterRoles: Array<"ADMIN" | "LOGISTICS">;
    statuses: string[];
    lifecycleMap: Record<string, WorkflowLifecycleState>;
};

export const WORKFLOW_CATALOG: Record<WorkflowDefinitionCode, WorkflowCatalogEntry> = {
    ARTWORK_SUPPORT: {
        code: "ARTWORK_SUPPORT",
        label: "Artwork Support",
        description: "Internal artwork and design support workflow",
        allowedEntityTypes: ["ORDER", "INBOUND_REQUEST", "SERVICE_REQUEST"],
        requesterRoles: ["ADMIN", "LOGISTICS"],
        statuses: ["REQUESTED", "ACKNOWLEDGED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
        lifecycleMap: {
            REQUESTED: "OPEN",
            ACKNOWLEDGED: "OPEN",
            IN_PROGRESS: "ACTIVE",
            COMPLETED: "DONE",
            CANCELLED: "CANCELLED",
        },
    },
};

export const DEFAULT_WORKFLOW_DEFINITIONS = Object.values(WORKFLOW_CATALOG).map((entry, index) => ({
    code: entry.code,
    label: entry.label,
    description: entry.description,
    allowed_entity_types: entry.allowedEntityTypes,
    requester_roles: entry.requesterRoles,
    sort_order: index,
}));

export const getWorkflowCatalogEntry = (code: string) => {
    return WORKFLOW_CATALOG[code as WorkflowDefinitionCode] || null;
};

export const getWorkflowLifecycleState = (code: string, status: string): WorkflowLifecycleState => {
    const entry = getWorkflowCatalogEntry(code);
    if (!entry) return "OPEN";
    return entry.lifecycleMap[status] || "OPEN";
};
