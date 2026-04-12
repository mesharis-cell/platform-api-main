import { and, asc, count, eq, inArray } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    companies,
    inboundRequests,
    orders,
    serviceRequests,
    workflowDefinitionCompanyOverrides,
    workflowDefinitions,
    workflowRequests,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import {
    assertWorkflowFamilySupportsStatusModel,
    getWorkflowFamilyEntry,
    getWorkflowStatusModelEntry,
} from "../../utils/workflow-catalog";

type WorkflowEntityType = "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST" | "SELF_PICKUP";
type WorkflowDefinitionPayload = Partial<{
    code: string;
    label: string;
    description: string | null;
    workflow_family: string;
    status_model_key: string;
    allowed_entity_types: string[];
    requester_roles: string[];
    viewer_roles: string[];
    actor_roles: string[];
    priority_enabled: boolean;
    sla_hours: number | null;
    blocks_fulfillment_default: boolean;
    intake_schema: Record<string, unknown>;
    is_active: boolean;
    sort_order: number;
}>;

const hydrateDefinition = (
    definition: typeof workflowDefinitions.$inferSelect,
    overrides: Array<typeof workflowDefinitionCompanyOverrides.$inferSelect>
) => {
    const family = getWorkflowFamilyEntry(definition.workflow_family);
    const statusModel = getWorkflowStatusModelEntry(definition.status_model_key);

    return {
        ...definition,
        family,
        status_model: statusModel,
        company_overrides: overrides.filter(
            (override) => override.workflow_definition_id === definition.id
        ),
    };
};

const assertWorkflowBehavior = (workflowFamily: string, statusModelKey: string) => {
    const family = getWorkflowFamilyEntry(workflowFamily);
    if (!family) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Unsupported workflow family");
    }

    const statusModel = getWorkflowStatusModelEntry(statusModelKey);
    if (!statusModel) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Unsupported workflow status model");
    }

    if (!assertWorkflowFamilySupportsStatusModel(workflowFamily, statusModelKey)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Workflow family does not support the selected status model"
        );
    }
};

const getDefinitionById = async (id: string, platformId: string) => {
    const [definition] = await db
        .select()
        .from(workflowDefinitions)
        .where(and(eq(workflowDefinitions.id, id), eq(workflowDefinitions.platform_id, platformId)))
        .limit(1);

    if (!definition) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Workflow definition not found");
    }

    return definition;
};

const listWorkflowDefinitions = async (platformId: string) => {
    const definitions = await db
        .select()
        .from(workflowDefinitions)
        .where(eq(workflowDefinitions.platform_id, platformId))
        .orderBy(asc(workflowDefinitions.sort_order), asc(workflowDefinitions.label));

    const overrides = await db
        .select()
        .from(workflowDefinitionCompanyOverrides)
        .where(eq(workflowDefinitionCompanyOverrides.platform_id, platformId));

    return definitions.map((definition) => hydrateDefinition(definition, overrides));
};

const createWorkflowDefinition = async (platformId: string, payload: WorkflowDefinitionPayload) => {
    assertWorkflowBehavior(payload.workflow_family!, payload.status_model_key!);

    const [created] = await db
        .insert(workflowDefinitions)
        .values({
            platform_id: platformId,
            code: payload.code!.trim().toUpperCase(),
            label: payload.label!.trim(),
            description: payload.description?.trim() || null,
            workflow_family: payload.workflow_family!,
            status_model_key: payload.status_model_key!,
            allowed_entity_types: payload.allowed_entity_types as any,
            requester_roles: payload.requester_roles as any,
            viewer_roles: payload.viewer_roles as any,
            actor_roles: payload.actor_roles as any,
            priority_enabled: payload.priority_enabled ?? false,
            sla_hours: payload.sla_hours ?? null,
            blocks_fulfillment_default: payload.blocks_fulfillment_default ?? false,
            intake_schema: payload.intake_schema ?? {},
            is_active: payload.is_active ?? true,
            sort_order: payload.sort_order ?? 0,
        })
        .returning();

    return hydrateDefinition(created, []);
};

const getEntityCompanyId = async (
    entityType: WorkflowEntityType,
    entityId: string,
    platformId: string
) => {
    if (entityType === "ORDER") {
        const [row] = await db
            .select({ company_id: orders.company_id })
            .from(orders)
            .where(and(eq(orders.id, entityId), eq(orders.platform_id, platformId)))
            .limit(1);
        return row?.company_id ?? null;
    }
    if (entityType === "INBOUND_REQUEST") {
        const [row] = await db
            .select({ company_id: inboundRequests.company_id })
            .from(inboundRequests)
            .where(
                and(eq(inboundRequests.id, entityId), eq(inboundRequests.platform_id, platformId))
            )
            .limit(1);
        return row?.company_id ?? null;
    }
    const [row] = await db
        .select({ company_id: serviceRequests.company_id })
        .from(serviceRequests)
        .where(and(eq(serviceRequests.id, entityId), eq(serviceRequests.platform_id, platformId)))
        .limit(1);
    return row?.company_id ?? null;
};

const listAvailableWorkflowDefinitions = async (
    platformId: string,
    user: AuthUser,
    entityType: WorkflowEntityType,
    entityId: string
) => {
    const companyId = await getEntityCompanyId(entityType, entityId, platformId);
    const definitions = await db
        .select()
        .from(workflowDefinitions)
        .where(eq(workflowDefinitions.platform_id, platformId))
        .orderBy(asc(workflowDefinitions.sort_order), asc(workflowDefinitions.label));

    const overrides = companyId
        ? await db
              .select()
              .from(workflowDefinitionCompanyOverrides)
              .where(
                  and(
                      eq(workflowDefinitionCompanyOverrides.platform_id, platformId),
                      eq(workflowDefinitionCompanyOverrides.company_id, companyId)
                  )
              )
        : [];

    return definitions
        .map((definition) => {
            const override = overrides.find(
                (item) =>
                    item.workflow_definition_id === definition.id && item.company_id === companyId
            );
            return {
                ...definition,
                label: override?.label_override?.trim() || definition.label,
                sort_order: override?.sort_order_override ?? definition.sort_order,
                company_override: override ?? null,
                family: getWorkflowFamilyEntry(definition.workflow_family),
                status_model: getWorkflowStatusModelEntry(definition.status_model_key),
            };
        })
        .filter((definition) => {
            const entityAllowed = definition.allowed_entity_types.includes(entityType as any);
            const roleAllowed = definition.requester_roles.includes(user.role);
            const enabled = definition.company_override
                ? definition.company_override.is_enabled
                : definition.is_active;
            return entityAllowed && roleAllowed && enabled;
        })
        .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
};

const updateWorkflowDefinition = async (
    id: string,
    platformId: string,
    payload: WorkflowDefinitionPayload
) => {
    const existing = await getDefinitionById(id, platformId);

    const workflowFamily = payload.workflow_family ?? existing.workflow_family;
    const statusModelKey = payload.status_model_key ?? existing.status_model_key;
    assertWorkflowBehavior(workflowFamily, statusModelKey);

    const [updated] = await db
        .update(workflowDefinitions)
        .set({
            ...(payload.code !== undefined && { code: payload.code.trim().toUpperCase() }),
            ...(payload.label !== undefined && { label: payload.label.trim() }),
            ...(payload.description !== undefined && {
                description: payload.description?.trim() || null,
            }),
            ...(payload.workflow_family !== undefined && {
                workflow_family: payload.workflow_family,
            }),
            ...(payload.status_model_key !== undefined && {
                status_model_key: payload.status_model_key,
            }),
            ...(payload.allowed_entity_types !== undefined && {
                allowed_entity_types: payload.allowed_entity_types as any,
            }),
            ...(payload.requester_roles !== undefined && {
                requester_roles: payload.requester_roles as any,
            }),
            ...(payload.viewer_roles !== undefined && {
                viewer_roles: payload.viewer_roles as any,
            }),
            ...(payload.actor_roles !== undefined && {
                actor_roles: payload.actor_roles as any,
            }),
            ...(payload.priority_enabled !== undefined && {
                priority_enabled: payload.priority_enabled,
            }),
            ...(payload.sla_hours !== undefined && {
                sla_hours: payload.sla_hours ?? null,
            }),
            ...(payload.blocks_fulfillment_default !== undefined && {
                blocks_fulfillment_default: payload.blocks_fulfillment_default,
            }),
            ...(payload.intake_schema !== undefined && {
                intake_schema: payload.intake_schema,
            }),
            ...(payload.is_active !== undefined && { is_active: payload.is_active }),
            ...(payload.sort_order !== undefined && { sort_order: payload.sort_order }),
            updated_at: new Date(),
        })
        .where(eq(workflowDefinitions.id, id))
        .returning();

    const overrides = await db
        .select()
        .from(workflowDefinitionCompanyOverrides)
        .where(eq(workflowDefinitionCompanyOverrides.workflow_definition_id, id));

    return hydrateDefinition(updated, overrides);
};

const replaceCompanyOverrides = async (
    workflowDefinitionId: string,
    platformId: string,
    overrides: Array<{
        company_id: string;
        is_enabled: boolean;
        label_override?: string | null;
        sort_order_override?: number | null;
    }>
) => {
    await getDefinitionById(workflowDefinitionId, platformId);

    const companyIds = overrides.map((item) => item.company_id);
    if (companyIds.length > 0) {
        const validCompanies = await db
            .select({ id: companies.id })
            .from(companies)
            .where(and(eq(companies.platform_id, platformId), inArray(companies.id, companyIds)));
        if (validCompanies.length !== companyIds.length) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "One or more companies are invalid");
        }
    }

    await db
        .delete(workflowDefinitionCompanyOverrides)
        .where(eq(workflowDefinitionCompanyOverrides.workflow_definition_id, workflowDefinitionId));

    if (overrides.length > 0) {
        await db.insert(workflowDefinitionCompanyOverrides).values(
            overrides.map((override) => ({
                platform_id: platformId,
                workflow_definition_id: workflowDefinitionId,
                company_id: override.company_id,
                is_enabled: override.is_enabled,
                label_override: override.label_override?.trim() || null,
                sort_order_override: override.sort_order_override ?? null,
            }))
        );
    }

    return listWorkflowDefinitions(platformId);
};

const deleteWorkflowDefinition = async (id: string, platformId: string) => {
    await getDefinitionById(id, platformId);

    const [existingRequests] = await db
        .select({ count: count() })
        .from(workflowRequests)
        .where(
            and(
                eq(workflowRequests.workflow_definition_id, id),
                eq(workflowRequests.platform_id, platformId)
            )
        )
        .limit(1);

    if (Number(existingRequests?.count ?? 0) > 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Workflow definition cannot be deleted after requests have been created"
        );
    }

    await db
        .delete(workflowDefinitionCompanyOverrides)
        .where(eq(workflowDefinitionCompanyOverrides.workflow_definition_id, id));

    await db
        .delete(workflowDefinitions)
        .where(
            and(eq(workflowDefinitions.id, id), eq(workflowDefinitions.platform_id, platformId))
        );
    return { id };
};

const assertWorkflowStatusIsValid = (statusModelKey: string, status: string) => {
    const statusModel = getWorkflowStatusModelEntry(statusModelKey);
    if (!statusModel || !statusModel.statuses.includes(status)) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid workflow status");
    }
};

export const WorkflowDefinitionServices = {
    listWorkflowDefinitions,
    createWorkflowDefinition,
    listAvailableWorkflowDefinitions,
    updateWorkflowDefinition,
    replaceCompanyOverrides,
    deleteWorkflowDefinition,
    getDefinitionById,
    assertWorkflowStatusIsValid,
};
