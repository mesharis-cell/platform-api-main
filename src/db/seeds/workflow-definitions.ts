/**
 * Shared seed module: workflow definitions.
 *
 * Canonical platform-default workflow definition(s). Companies can enable /
 * disable / relabel per-company via workflow_definition_company_overrides.
 *
 * Consumers: src/db/seed-test.ts
 * Future consumers: seed.ts, seed-pr.ts, seed-demo-pr.ts (refactor task).
 */

import { db } from "../index";
import * as schema from "../schema";

export const CANONICAL_WORKFLOW_DEFINITIONS = [
    {
        code: "CREATIVE_SUPPORT",
        label: "Creative Support",
        description: "Request internal creative and design support for delivery prep.",
        workflow_family: "simple_request",
        status_model_key: "simple_request",
        allowed_entity_types: ["ORDER", "INBOUND_REQUEST", "SERVICE_REQUEST"] as const,
        requester_roles: ["ADMIN", "LOGISTICS"] as const,
        viewer_roles: ["ADMIN", "LOGISTICS"] as const,
        actor_roles: ["ADMIN", "LOGISTICS"] as const,
        priority_enabled: true,
        sla_hours: 48,
        blocks_fulfillment_default: false,
        sort_order: 0,
    },
];

export type SeedWorkflowDefinitionsOpts = {
    platformId: string;
};

export const seedWorkflowDefinitions = async (opts: SeedWorkflowDefinitionsOpts) => {
    const rows = CANONICAL_WORKFLOW_DEFINITIONS.map((d) => ({
        platform_id: opts.platformId,
        code: d.code,
        label: d.label,
        description: d.description,
        workflow_family: d.workflow_family,
        status_model_key: d.status_model_key,
        allowed_entity_types: [...d.allowed_entity_types],
        requester_roles: [...d.requester_roles],
        viewer_roles: [...d.viewer_roles],
        actor_roles: [...d.actor_roles],
        priority_enabled: d.priority_enabled,
        sla_hours: d.sla_hours,
        blocks_fulfillment_default: d.blocks_fulfillment_default,
        intake_schema: {},
        is_active: true,
        sort_order: d.sort_order,
    }));
    return db.insert(schema.workflowDefinitions).values(rows).returning();
};
