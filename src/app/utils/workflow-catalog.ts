export type WorkflowLifecycleState = "OPEN" | "ACTIVE" | "DONE" | "CANCELLED";
export type WorkflowFamilyKey = "simple_request" | "document_collection" | "approval";
export type WorkflowStatusModelKey = "simple_request" | "document_collection" | "approval";

type WorkflowStatusModel = {
    key: WorkflowStatusModelKey;
    label: string;
    statuses: string[];
    initialStatus: string;
    lifecycleMap: Record<string, WorkflowLifecycleState>;
};

type WorkflowFamily = {
    key: WorkflowFamilyKey;
    label: string;
    description: string;
    component_key: string;
    supportedStatusModels: WorkflowStatusModelKey[];
};

export const WORKFLOW_STATUS_MODELS: Record<WorkflowStatusModelKey, WorkflowStatusModel> = {
    simple_request: {
        key: "simple_request",
        label: "Simple Request",
        statuses: ["REQUESTED", "ACKNOWLEDGED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
        initialStatus: "REQUESTED",
        lifecycleMap: {
            REQUESTED: "OPEN",
            ACKNOWLEDGED: "OPEN",
            IN_PROGRESS: "ACTIVE",
            COMPLETED: "DONE",
            CANCELLED: "CANCELLED",
        },
    },
    document_collection: {
        key: "document_collection",
        label: "Document Collection",
        statuses: ["REQUESTED", "COLLECTING", "UNDER_REVIEW", "COMPLETED", "CANCELLED"],
        initialStatus: "REQUESTED",
        lifecycleMap: {
            REQUESTED: "OPEN",
            COLLECTING: "ACTIVE",
            UNDER_REVIEW: "ACTIVE",
            COMPLETED: "DONE",
            CANCELLED: "CANCELLED",
        },
    },
    approval: {
        key: "approval",
        label: "Approval",
        statuses: ["REQUESTED", "IN_REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
        initialStatus: "REQUESTED",
        lifecycleMap: {
            REQUESTED: "OPEN",
            IN_REVIEW: "ACTIVE",
            APPROVED: "DONE",
            REJECTED: "DONE",
            CANCELLED: "CANCELLED",
        },
    },
};

export const WORKFLOW_FAMILIES: Record<WorkflowFamilyKey, WorkflowFamily> = {
    simple_request: {
        key: "simple_request",
        label: "Simple Request",
        description:
            "General internal request with notes, attachments, and a lightweight status flow.",
        component_key: "simple-request",
        supportedStatusModels: ["simple_request", "document_collection", "approval"],
    },
    document_collection: {
        key: "document_collection",
        label: "Document Collection",
        description: "Collect and review files or supporting documents against a request.",
        component_key: "document-collection",
        supportedStatusModels: ["document_collection"],
    },
    approval: {
        key: "approval",
        label: "Approval",
        description: "Structured review flow that ends in approval or rejection.",
        component_key: "approval",
        supportedStatusModels: ["approval"],
    },
};

export const listWorkflowFamilyOptions = () => Object.values(WORKFLOW_FAMILIES);

export const listWorkflowStatusModelOptions = () => Object.values(WORKFLOW_STATUS_MODELS);

export const getWorkflowFamilyEntry = (key: string) =>
    WORKFLOW_FAMILIES[key as WorkflowFamilyKey] || null;

export const getWorkflowStatusModelEntry = (key: string) =>
    WORKFLOW_STATUS_MODELS[key as WorkflowStatusModelKey] || null;

export const assertWorkflowFamilySupportsStatusModel = (
    familyKey: string,
    statusModelKey: string
) => {
    const family = getWorkflowFamilyEntry(familyKey);
    const statusModel = getWorkflowStatusModelEntry(statusModelKey);

    if (!family || !statusModel) return false;
    return family.supportedStatusModels.includes(statusModel.key);
};

export const getWorkflowInitialStatus = (statusModelKey: string) =>
    getWorkflowStatusModelEntry(statusModelKey)?.initialStatus || "REQUESTED";

export const getWorkflowLifecycleState = (
    statusModelKey: string,
    status: string
): WorkflowLifecycleState => {
    const statusModel = getWorkflowStatusModelEntry(statusModelKey);
    if (!statusModel) return "OPEN";
    return statusModel.lifecycleMap[status] || "OPEN";
};

export const isWorkflowStatusValid = (statusModelKey: string, status: string) => {
    const statusModel = getWorkflowStatusModelEntry(statusModelKey);
    return Boolean(statusModel?.statuses.includes(status));
};
