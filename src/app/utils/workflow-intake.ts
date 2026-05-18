import { getWorkflowLifecycleState } from "./workflow-catalog";

export type WorkflowIntakeFieldType = "text" | "textarea" | "date" | "number";

export type WorkflowIntakeField = {
    key: string;
    label: string;
    type: WorkflowIntakeFieldType;
    required?: boolean;
};

export type WorkflowIntakeSchema = {
    fields?: WorkflowIntakeField[];
    required_attachment_type_ids?: string[];
};

export const INTAKE_VALUES_KEY = "intake_values";

export const normalizeWorkflowIntakeSchema = (raw: unknown): WorkflowIntakeSchema => {
    if (!raw || typeof raw !== "object") return {};
    const candidate = raw as WorkflowIntakeSchema;
    const fields = Array.isArray(candidate.fields)
        ? candidate.fields
              .filter(
                  (field) =>
                      field &&
                      typeof field.key === "string" &&
                      typeof field.label === "string" &&
                      ["text", "textarea", "date", "number"].includes(String(field.type))
              )
              .map((field) => ({
                  key: field.key.trim(),
                  label: field.label.trim(),
                  type: field.type,
                  required: field.required === true,
              }))
              .filter((field) => field.key.length > 0 && field.label.length > 0)
        : [];

    const requiredAttachmentTypeIds = Array.isArray(candidate.required_attachment_type_ids)
        ? candidate.required_attachment_type_ids.filter(
              (id): id is string => typeof id === "string"
          )
        : [];

    return {
        ...(fields.length > 0 ? { fields } : {}),
        ...(requiredAttachmentTypeIds.length > 0
            ? { required_attachment_type_ids: requiredAttachmentTypeIds }
            : {}),
    };
};

export const getWorkflowIntakeValues = (metadata: unknown): Record<string, unknown> => {
    if (!metadata || typeof metadata !== "object") return {};
    const values = (metadata as Record<string, unknown>)[INTAKE_VALUES_KEY];
    return values && typeof values === "object" && !Array.isArray(values)
        ? (values as Record<string, unknown>)
        : {};
};

export const isBlankWorkflowValue = (value: unknown) =>
    value === undefined || value === null || (typeof value === "string" && value.trim() === "");

export const getWorkflowReviewStatus = (statusModelKey: string) => {
    if (statusModelKey === "document_collection") return "UNDER_REVIEW";
    if (statusModelKey === "approval") return "IN_REVIEW";
    return "IN_PROGRESS";
};

export const isWorkflowSubmitForReviewStatus = (statusModelKey: string, status: string) =>
    status === getWorkflowReviewStatus(statusModelKey);

export const isWorkflowClientEditableStatus = (statusModelKey: string, status: string) => {
    if (["COMPLETED", "APPROVED", "REJECTED", "CANCELLED"].includes(status)) return false;
    if (statusModelKey === "document_collection") {
        return ["REQUESTED", "COLLECTING"].includes(status);
    }
    if (statusModelKey === "approval") {
        return status === "REQUESTED";
    }
    return ["REQUESTED", "ACKNOWLEDGED"].includes(status);
};

export const isWorkflowClientActionRequired = (
    statusModelKey: string,
    status: string,
    actorRoles: string[]
) => actorRoles.includes("CLIENT") && isWorkflowClientEditableStatus(statusModelKey, status);

export const isWorkflowClientVisible = (viewerRoles: string[], actorRoles: string[]) =>
    viewerRoles.includes("CLIENT") || actorRoles.includes("CLIENT");

export const isWorkflowTerminal = (statusModelKey: string, status: string) =>
    ["DONE", "CANCELLED"].includes(getWorkflowLifecycleState(statusModelKey, status));
