/**
 * Workflow auto-open evaluator (Item 4 of the 9-item bundle).
 *
 * Workflow definitions can declare an `auto_open_conditions` JSONB payload
 * that says: "when trigger event T fires on entity X, and these conditions
 * match the entity payload, auto-create a workflow_request on it."
 *
 * Resolution flow:
 *   1. Caller invokes evaluateAndCreate(trigger, entityRef, ctx).
 *   2. We load all active workflow definitions for the platform whose
 *      auto_open_conditions.trigger_event matches.
 *   3. For each, run the condition predicates against the entity payload.
 *   4. For matches, create a workflow_request if one is not already OPEN
 *      on this entity for that workflow_code (idempotent — re-firing the
 *      trigger doesn't create duplicates).
 *
 * The condition vocabulary is intentionally narrow for v1:
 *   - operators: equals | not_equals | in | not_in | truthy | falsy
 *   - sources are dotted paths into the entity payload (e.g.
 *     "permit_requirements.permit_owner"). Resolution uses a tiny dotted-
 *     get; unknown paths resolve to undefined and never match equals.
 */

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import {
    workflowDefinitions,
    workflowRequests,
    workflowRequestStatusHistory,
} from "../../db/schema";
import { eventBus, EVENT_TYPES } from "../events";
import { getWorkflowInitialStatus } from "../utils/workflow-catalog";
import { getSystemUser } from "../utils/helper-query";

export type WorkflowTriggerEvent =
    | "ORDER_CONFIRMED"
    | "ORDER_SUBMITTED"
    | "SELF_PICKUP_CONFIRMED"
    | "SELF_PICKUP_SUBMITTED";

export type WorkflowAutoOpenEntityType = "ORDER" | "SELF_PICKUP";

type Operator = "equals" | "not_equals" | "in" | "not_in" | "truthy" | "falsy";

type Condition = {
    source: string;
    operator: Operator;
    value?: unknown;
};

type AutoOpenConditions = {
    trigger_event: WorkflowTriggerEvent;
    conditions?: Condition[];
};

const getDotted = (obj: unknown, path: string): unknown => {
    if (!path) return undefined;
    return path.split(".").reduce<any>((acc, key) => {
        if (acc === null || acc === undefined) return undefined;
        return acc[key];
    }, obj);
};

const evaluateCondition = (entity: unknown, condition: Condition): boolean => {
    const actual = getDotted(entity, condition.source);
    switch (condition.operator) {
        case "equals":
            return actual === condition.value;
        case "not_equals":
            return actual !== condition.value;
        case "in":
            return Array.isArray(condition.value) && condition.value.includes(actual as any);
        case "not_in":
            return Array.isArray(condition.value) && !condition.value.includes(actual as any);
        case "truthy":
            return Boolean(actual);
        case "falsy":
            return !actual;
        default:
            return false;
    }
};

const conditionsMatch = (entity: unknown, conditions?: Condition[]): boolean => {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every((c) => evaluateCondition(entity, c));
};

const parseAutoOpenConditions = (raw: unknown): AutoOpenConditions | null => {
    if (!raw || typeof raw !== "object") return null;
    const candidate = raw as Partial<AutoOpenConditions>;
    if (!candidate.trigger_event) return null;
    return {
        trigger_event: candidate.trigger_event,
        conditions: Array.isArray(candidate.conditions) ? candidate.conditions : [],
    };
};

export type AutoOpenContext = {
    platformId: string;
    companyId?: string | null;
    triggeredByUserId?: string | null;
};

export type AutoOpenEntityRef = {
    type: WorkflowAutoOpenEntityType;
    id: string;
    payload: Record<string, unknown>;
};

/**
 * Find matching definitions, create workflow_requests for each, and emit
 * WORKFLOW_REQUEST_SUBMITTED events for downstream notifications. Skips
 * any definition whose workflow_code already has an OPEN request on this
 * entity (idempotency under re-firing triggers).
 */
export const evaluateAndCreate = async (
    trigger: WorkflowTriggerEvent,
    entity: AutoOpenEntityRef,
    ctx: AutoOpenContext
): Promise<{ created: number }> => {
    // Pull active definitions on this platform that declare an auto-open
    // payload. Filter the trigger in code rather than via JSONB SQL — keeps
    // the index demand low and the matching predicate easy to evolve.
    const candidateDefs = await db
        .select({
            id: workflowDefinitions.id,
            code: workflowDefinitions.code,
            label: workflowDefinitions.label,
            workflow_family: workflowDefinitions.workflow_family,
            status_model_key: workflowDefinitions.status_model_key,
            allowed_entity_types: workflowDefinitions.allowed_entity_types,
            blocks_fulfillment_default: workflowDefinitions.blocks_fulfillment_default,
            auto_open_conditions: workflowDefinitions.auto_open_conditions,
        })
        .from(workflowDefinitions)
        .where(
            and(
                eq(workflowDefinitions.platform_id, ctx.platformId),
                eq(workflowDefinitions.is_active, true),
                isNotNull(workflowDefinitions.auto_open_conditions)
            )
        );

    const matches = candidateDefs.filter((def) => {
        const parsed = parseAutoOpenConditions(def.auto_open_conditions);
        if (!parsed) return false;
        if (parsed.trigger_event !== trigger) return false;
        // Only fire on entity types the definition actually allows.
        if (!(def.allowed_entity_types as string[]).includes(entity.type)) return false;
        return conditionsMatch(entity.payload, parsed.conditions);
    });

    if (matches.length === 0) return { created: 0 };

    // requested_by is NOT NULL on workflow_requests. For auto-opens we
    // attribute to the triggering user when available; otherwise fall back
    // to the platform system user.
    let requesterId = ctx.triggeredByUserId ?? null;
    let requesterRole: "ADMIN" | "LOGISTICS" | "CLIENT" = "ADMIN";
    if (!requesterId) {
        const systemUser = await getSystemUser(ctx.platformId);
        if (!systemUser) {
            // Without a system user we can't satisfy the FK — log and bail
            // rather than crash the parent flow.
            // eslint-disable-next-line no-console
            console.warn(
                `[workflow-auto-open] No system user on platform ${ctx.platformId}; skipping auto-open for trigger ${trigger}`
            );
            return { created: 0 };
        }
        requesterId = systemUser.id;
        requesterRole = (systemUser.role as any) || "ADMIN";
    }

    // Idempotency — skip if a non-terminal workflow_request already exists
    // for this (entity, workflow_code).
    const existing = await db
        .select({
            workflow_code: workflowRequests.workflow_code,
            status: workflowRequests.status,
        })
        .from(workflowRequests)
        .where(
            and(
                eq(workflowRequests.platform_id, ctx.platformId),
                eq(workflowRequests.entity_type, entity.type as any),
                eq(workflowRequests.entity_id, entity.id),
                inArray(
                    workflowRequests.workflow_code,
                    matches.map((m) => m.code)
                )
            )
        );

    const terminalStatuses = new Set(["COMPLETED", "CANCELLED"]);
    const openCodes = new Set(
        existing.filter((r) => !terminalStatuses.has(String(r.status))).map((r) => r.workflow_code)
    );

    let created = 0;
    for (const def of matches) {
        if (openCodes.has(def.code)) continue;

        const initialStatus = getWorkflowInitialStatus(def.status_model_key) || "OPEN";

        const [row] = await db
            .insert(workflowRequests)
            .values({
                platform_id: ctx.platformId,
                entity_type: entity.type as any,
                entity_id: entity.id,
                workflow_definition_id: def.id,
                workflow_code: def.code,
                workflow_label: def.label,
                workflow_family: def.workflow_family,
                status_model_key: def.status_model_key,
                status: initialStatus,
                title: def.label,
                requested_by: requesterId,
                requested_by_role: requesterRole,
                requested_at: new Date(),
                metadata: {},
            })
            .returning({ id: workflowRequests.id });

        if (row?.id) {
            await db.insert(workflowRequestStatusHistory).values({
                workflow_request_id: row.id,
                from_status: null,
                to_status: initialStatus,
                changed_by: ctx.triggeredByUserId || null,
                note: `Auto-opened by trigger ${trigger}`,
            });

            eventBus.emit({
                event_type: EVENT_TYPES.WORKFLOW_REQUEST_SUBMITTED,
                platform_id: ctx.platformId,
                entity_type: entity.type as any,
                entity_id: entity.id,
                actor_id: ctx.triggeredByUserId || undefined,
                payload: {
                    workflow_request_id: row.id,
                    workflow_code: def.code,
                    workflow_label: def.label,
                    workflow_family: def.workflow_family,
                    workflow_status: initialStatus,
                    auto_opened: true,
                    trigger_event: trigger,
                },
            });
            created++;
        }
    }

    return { created };
};

export const WorkflowAutoOpenService = {
    evaluateAndCreate,
};
