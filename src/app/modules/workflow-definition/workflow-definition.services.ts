import { and, asc, eq, inArray } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    companies,
    inboundRequests,
    orders,
    serviceRequests,
    workflowDefinitionCompanyOverrides,
    workflowDefinitions,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import {
    DEFAULT_WORKFLOW_DEFINITIONS,
    getWorkflowCatalogEntry,
} from "../../utils/workflow-catalog";

const ensureDefaultWorkflowDefinitions = async (platformId: string) => {
    const existing = await db
        .select({ code: workflowDefinitions.code })
        .from(workflowDefinitions)
        .where(eq(workflowDefinitions.platform_id, platformId));
    const existingCodes = new Set(existing.map((row) => row.code));
    const missing = DEFAULT_WORKFLOW_DEFINITIONS.filter(
        (definition) => !existingCodes.has(definition.code)
    );

    if (missing.length === 0) return;

    await db.insert(workflowDefinitions).values(
        missing.map((definition) => ({
            platform_id: platformId,
            code: definition.code,
            label: definition.label,
            description: definition.description,
            allowed_entity_types: definition.allowed_entity_types as any,
            requester_roles: definition.requester_roles as any,
            sort_order: definition.sort_order,
        }))
    );
};

const listWorkflowDefinitions = async (platformId: string) => {
    await ensureDefaultWorkflowDefinitions(platformId);

    const definitions = await db
        .select()
        .from(workflowDefinitions)
        .where(eq(workflowDefinitions.platform_id, platformId))
        .orderBy(asc(workflowDefinitions.sort_order), asc(workflowDefinitions.label));

    const overrides = await db
        .select()
        .from(workflowDefinitionCompanyOverrides)
        .where(eq(workflowDefinitionCompanyOverrides.platform_id, platformId));

    return definitions.map((definition) => ({
        ...definition,
        company_overrides: overrides.filter(
            (override) => override.workflow_definition_id === definition.id
        ),
    }));
};

const getEntityCompanyId = async (
    entityType: "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST",
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
    entityType: "ORDER" | "INBOUND_REQUEST" | "SERVICE_REQUEST",
    entityId: string
) => {
    await ensureDefaultWorkflowDefinitions(platformId);
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

    return definitions.filter((definition) => {
        const entityAllowed = definition.allowed_entity_types.includes(entityType as any);
        const roleAllowed = definition.requester_roles.includes(user.role);
        const override = overrides.find(
            (item) => item.workflow_definition_id === definition.id && item.company_id === companyId
        );
        const enabled = override ? override.is_enabled : definition.is_active;
        return entityAllowed && roleAllowed && enabled;
    });
};

const updateWorkflowDefinition = async (
    id: string,
    platformId: string,
    payload: Partial<{
        label: string;
        description: string | null;
        allowed_entity_types: string[];
        requester_roles: string[];
        is_active: boolean;
        sort_order: number;
    }>
) => {
    await ensureDefaultWorkflowDefinitions(platformId);
    const [existing] = await db
        .select()
        .from(workflowDefinitions)
        .where(and(eq(workflowDefinitions.id, id), eq(workflowDefinitions.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Workflow definition not found");
    }

    const [updated] = await db
        .update(workflowDefinitions)
        .set({
            ...(payload.label !== undefined && { label: payload.label.trim() }),
            ...(payload.description !== undefined && {
                description: payload.description?.trim() || null,
            }),
            ...(payload.allowed_entity_types !== undefined && {
                allowed_entity_types: payload.allowed_entity_types as any,
            }),
            ...(payload.requester_roles !== undefined && {
                requester_roles: payload.requester_roles as any,
            }),
            ...(payload.is_active !== undefined && { is_active: payload.is_active }),
            ...(payload.sort_order !== undefined && { sort_order: payload.sort_order }),
            updated_at: new Date(),
        })
        .where(eq(workflowDefinitions.id, id))
        .returning();

    return updated;
};

const replaceCompanyOverrides = async (
    workflowDefinitionId: string,
    platformId: string,
    overrides: Array<{ company_id: string; is_enabled: boolean }>
) => {
    const [definition] = await db
        .select({ id: workflowDefinitions.id })
        .from(workflowDefinitions)
        .where(
            and(
                eq(workflowDefinitions.id, workflowDefinitionId),
                eq(workflowDefinitions.platform_id, platformId)
            )
        )
        .limit(1);

    if (!definition) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Workflow definition not found");
    }

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
            }))
        );
    }

    return listWorkflowDefinitions(platformId);
};

const assertWorkflowStatusIsValid = (workflowCode: string, status: string) => {
    const entry = getWorkflowCatalogEntry(workflowCode);
    if (!entry || !entry.statuses.includes(status)) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid workflow status");
    }
};

export const WorkflowDefinitionServices = {
    ensureDefaultWorkflowDefinitions,
    listWorkflowDefinitions,
    listAvailableWorkflowDefinitions,
    updateWorkflowDefinition,
    replaceCompanyOverrides,
    assertWorkflowStatusIsValid,
};
