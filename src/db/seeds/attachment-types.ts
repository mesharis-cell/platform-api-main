/**
 * Shared seed module: attachment types.
 *
 * Canonical 3 attachment types for a platform. Single source of truth.
 *
 * Consumers: src/db/seed-test.ts
 * Future consumers: seed.ts, seed-pr.ts, seed-demo-pr.ts (refactor task).
 */

import { db } from "../index";
import * as schema from "../schema";

export const CANONICAL_ATTACHMENT_TYPES = [
    {
        code: "SUPPORTING_DOCUMENT",
        label: "Supporting Document",
        allowed_entity_types: ["ORDER", "INBOUND_REQUEST", "SERVICE_REQUEST"] as const,
        upload_roles: ["ADMIN", "LOGISTICS", "CLIENT"] as const,
        view_roles: ["ADMIN", "LOGISTICS", "CLIENT"] as const,
        default_visible_to_client: true,
        sort_order: 0,
    },
    {
        code: "INTERNAL_REFERENCE",
        label: "Internal Reference",
        allowed_entity_types: ["ORDER", "INBOUND_REQUEST", "SERVICE_REQUEST"] as const,
        upload_roles: ["ADMIN", "LOGISTICS"] as const,
        view_roles: ["ADMIN", "LOGISTICS"] as const,
        default_visible_to_client: false,
        sort_order: 1,
    },
    {
        code: "WORKFLOW_SUPPORTING_DOCUMENT",
        label: "Workflow Supporting Document",
        allowed_entity_types: ["WORKFLOW_REQUEST"] as const,
        upload_roles: ["ADMIN", "LOGISTICS"] as const,
        view_roles: ["ADMIN", "LOGISTICS"] as const,
        default_visible_to_client: false,
        sort_order: 2,
    },
];

export type SeedAttachmentTypesOpts = {
    platformId: string;
};

export const seedAttachmentTypes = async (opts: SeedAttachmentTypesOpts) => {
    const rows = CANONICAL_ATTACHMENT_TYPES.map((t) => ({
        platform_id: opts.platformId,
        code: t.code,
        label: t.label,
        allowed_entity_types: [...t.allowed_entity_types],
        upload_roles: [...t.upload_roles],
        view_roles: [...t.view_roles],
        default_visible_to_client: t.default_visible_to_client,
        sort_order: t.sort_order,
    }));
    return db.insert(schema.attachmentTypes).values(rows).returning();
};
