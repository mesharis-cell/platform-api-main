import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../db";
import {
    inboundRequests,
    notificationLogs,
    notificationRules,
    orders,
    platforms,
    selfPickups,
    serviceRequests,
    users,
} from "../../../db/schema";
import {
    AppTarget,
    DeepLinkEntityType,
    UrlResolverService,
} from "../../services/url-resolver.service";
import { SystemEvent } from "../event-types";
import { sql } from "drizzle-orm";

type NotificationCondition = {
    field:
        | "company_id"
        | "entity_type"
        | "actor_role"
        | "workflow_code"
        | "workflow_status"
        | "lifecycle_state"
        | "billing_mode"
        | "request_type";
    operator: "equals" | "in";
    value: string | string[];
};

export type NotificationDispatchTarget = {
    recipient_type: "ROLE" | "ENTITY_OWNER" | "EMAIL";
    recipient_value: string | null;
    template_key: string;
};

// ─── Recipient resolution ────────────────────────────────────────────────────

async function resolveEntityOwnerEmail(
    entityType: string,
    entityId: string,
    platformId: string
): Promise<string[]> {
    const tableMap: Record<string, any> = {
        ORDER: orders,
        INBOUND_REQUEST: inboundRequests,
        SERVICE_REQUEST: serviceRequests,
        SELF_PICKUP: selfPickups,
    };

    const table = tableMap[entityType];
    if (!table) return [];

    const [entity] = await db
        .select({ created_by: table.created_by })
        .from(table)
        .where(and(eq(table.id, entityId), eq(table.platform_id, platformId)));

    if (!entity?.created_by) return [];

    const [user] = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, entity.created_by));

    return user?.email ? [user.email] : [];
}

async function resolveRecipients(
    rule: typeof notificationRules.$inferSelect,
    event: SystemEvent
): Promise<string[]> {
    switch (rule.recipient_type) {
        case "ROLE": {
            const roleUsers = await db
                .select({ email: users.email })
                .from(users)
                .where(
                    and(
                        eq(users.platform_id, event.platform_id),
                        eq(users.role, rule.recipient_value as any),
                        sql`${users.email} NOT LIKE '%@system.internal'`
                    )
                );
            return roleUsers.map((u) => u.email);
        }

        case "ENTITY_OWNER": {
            // For USER entity type (auth events), resolve from the payload directly
            if (event.entity_type === "USER") {
                const email = (event.payload as any)?.email;
                return email ? [email] : [];
            }
            return resolveEntityOwnerEmail(event.entity_type, event.entity_id, event.platform_id);
        }

        case "EMAIL": {
            return rule.recipient_value ? [rule.recipient_value] : [];
        }

        default:
            return [];
    }
}

// ─── Rule resolution with company override merge ──────────────────────────────

async function getEntityCompanyId(entityType: string, entityId: string): Promise<string | null> {
    const tableMap: Record<string, any> = {
        ORDER: orders,
        INBOUND_REQUEST: inboundRequests,
        SERVICE_REQUEST: serviceRequests,
        SELF_PICKUP: selfPickups,
    };

    const table = tableMap[entityType];
    if (!table) return null;

    const [entity] = await db
        .select({ company_id: table.company_id })
        .from(table)
        .where(eq(table.id, entityId));

    return entity?.company_id ?? null;
}

async function getApplicableRules(
    event: SystemEvent
): Promise<(typeof notificationRules.$inferSelect)[]> {
    // Platform defaults (company_id IS NULL)
    const platformRules = await db
        .select()
        .from(notificationRules)
        .where(
            and(
                eq(notificationRules.platform_id, event.platform_id),
                eq(notificationRules.event_type, event.event_type),
                isNull(notificationRules.company_id)
            )
        )
        .orderBy(notificationRules.sort_order);

    // For USER entity types there's no company to fetch
    if (event.entity_type === "USER") return platformRules;

    const companyId = await getEntityCompanyId(event.entity_type, event.entity_id);
    if (!companyId) return platformRules;

    // Company overrides
    const companyRules = await db
        .select()
        .from(notificationRules)
        .where(
            and(
                eq(notificationRules.platform_id, event.platform_id),
                eq(notificationRules.event_type, event.event_type),
                eq(notificationRules.company_id, companyId)
            )
        )
        .orderBy(notificationRules.sort_order);

    if (companyRules.length === 0) return platformRules;

    // Merge: company rules override matching platform rules, additions are appended
    const merged = [...platformRules];
    for (const companyRule of companyRules) {
        const existingIdx = merged.findIndex(
            (r) =>
                r.recipient_type === companyRule.recipient_type &&
                r.recipient_value === companyRule.recipient_value
        );
        if (existingIdx >= 0) {
            merged[existingIdx] = companyRule;
        } else {
            merged.push(companyRule);
        }
    }

    return merged;
}

const getConditionValue = (event: SystemEvent, field: NotificationCondition["field"]) => {
    const payload = (event.payload || {}) as Record<string, unknown>;

    switch (field) {
        case "company_id":
            return String(payload.company_id || "");
        case "entity_type":
            return event.entity_type;
        case "actor_role":
            return String(event.actor_role || "");
        case "workflow_code":
            return String(payload.workflow_code || "");
        case "workflow_status":
            return String(payload.workflow_status || payload.new_status || "");
        case "lifecycle_state":
            return String(payload.lifecycle_state || "");
        case "billing_mode":
            return String(payload.billing_mode || "");
        case "request_type":
            return String(payload.request_type || "");
        default:
            return "";
    }
};

const ruleMatchesConditions = (
    rule: typeof notificationRules.$inferSelect,
    event: SystemEvent
): boolean => {
    const conditions = ((rule.conditions as NotificationCondition[] | null) || []).filter(Boolean);
    if (conditions.length === 0) return true;

    return conditions.every((condition) => {
        const actualValue = getConditionValue(event, condition.field);
        const expected = Array.isArray(condition.value) ? condition.value : [condition.value];

        if (condition.operator === "equals") {
            return actualValue === String(expected[0] || "");
        }

        return expected.map(String).includes(actualValue);
    });
};

const mapEntityTypeToDeepLink = (entityType: string): DeepLinkEntityType | null => {
    switch (entityType) {
        case "ORDER":
            return "ORDER";
        case "INBOUND_REQUEST":
            return "INBOUND_REQUEST";
        case "SERVICE_REQUEST":
            return "SERVICE_REQUEST";
        case "SELF_BOOKING":
            return "SELF_BOOKING";
        case "SELF_PICKUP":
            return "SELF_PICKUP";
        default:
            return null;
    }
};

const inferRuleTargetApp = (
    rule: NotificationDispatchTarget,
    event: SystemEvent
): AppTarget | null => {
    if (rule.recipient_type === "ROLE") {
        if (rule.recipient_value === "ADMIN") return "ADMIN";
        if (rule.recipient_value === "LOGISTICS") return "WAREHOUSE";
        return null;
    }

    if (rule.recipient_type === "ENTITY_OWNER") {
        if (event.entity_type === "USER") return null;
        if (event.entity_type === "SELF_BOOKING") return "ADMIN";
        return "CLIENT";
    }

    if (rule.recipient_type === "EMAIL") {
        const key = String(rule.template_key || "").toLowerCase();
        if (key.endsWith("_admin")) return "ADMIN";
        if (key.endsWith("_logistics")) return "WAREHOUSE";
        if (key.endsWith("_client")) return "CLIENT";
        return "ADMIN";
    }

    return null;
};

export const injectDeepLink = async (
    rule: NotificationDispatchTarget,
    event: SystemEvent,
    entityCompanyId: string | null
): Promise<Record<string, unknown>> => {
    const app = inferRuleTargetApp(rule, event);
    const deepLinkEntityType = mapEntityTypeToDeepLink(event.entity_type);

    if (!app || !deepLinkEntityType) {
        return { ...(event.payload as Record<string, unknown>) };
    }

    const link = await UrlResolverService.resolveEntityDeepLink({
        platformId: event.platform_id,
        companyId: entityCompanyId,
        app,
        entityType: deepLinkEntityType,
        entityId: event.entity_id,
    });

    if (!link) return { ...(event.payload as Record<string, unknown>) };

    const payload = { ...(event.payload as Record<string, unknown>) };
    if (event.entity_type === "ORDER") payload.order_url = link;
    if (event.entity_type === "INBOUND_REQUEST" || event.entity_type === "SERVICE_REQUEST") {
        payload.request_url = link;
    }
    if (event.entity_type === "SELF_BOOKING") payload.self_booking_url = link;
    if (event.entity_type === "SELF_PICKUP") payload.self_pickup_url = link;

    return payload;
};

// ─── Platform from_email lookup ───────────────────────────────────────────────

const UNCONFIGURED_FROM = "no-reply@unconfigured.kadence.app";

export async function getPlatformEmailSettings(platformId: string): Promise<{
    fromEmail: string;
    supportEmail: string;
}> {
    const [platform] = await db
        .select({ config: platforms.config })
        .from(platforms)
        .where(eq(platforms.id, platformId));
    const config = (platform?.config || {}) as Record<string, unknown>;
    const fromEmail =
        (typeof config.from_email === "string" && config.from_email) || UNCONFIGURED_FROM;
    const supportEmail =
        (typeof config.support_email === "string" && config.support_email.trim()) || "";

    return { fromEmail, supportEmail };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleEmailNotifications(event: SystemEvent): Promise<void> {
    const rules = await getApplicableRules(event);

    for (const rule of rules) {
        if (!rule.is_enabled) continue;
        if (!ruleMatchesConditions(rule, event)) continue;

        const emails = await resolveRecipients(rule, event);

        for (const email of emails) {
            await db
                .insert(notificationLogs)
                .values({
                    platform_id: event.platform_id,
                    event_id: event.id,
                    rule_id: rule.id,
                    recipient_email: email,
                    recipient_type: rule.recipient_type,
                    recipient_value: rule.recipient_value,
                    template_key: rule.template_key,
                    status: "QUEUED",
                    attempts: 0,
                    next_attempt_at: new Date(),
                })
                .returning({ id: notificationLogs.id });
        }
    }
}
