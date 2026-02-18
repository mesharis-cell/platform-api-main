import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../../db";
import {
    inboundRequests,
    notificationLogs,
    notificationRules,
    orders,
    serviceRequests,
    users,
} from "../../../db/schema";
import { sendEmail } from "../../services/email.service";
import { renderTemplate } from "../templates";
import { SystemEvent } from "../event-types";
import { sql } from "drizzle-orm";

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

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleEmailNotifications(event: SystemEvent): Promise<void> {
    const rules = await getApplicableRules(event);

    for (const rule of rules) {
        if (!rule.is_enabled) continue;

        const emails = await resolveRecipients(rule, event);

        for (const email of emails) {
            // Create QUEUED log entry
            const [logEntry] = await db
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
                    attempts: 1,
                    last_attempt_at: new Date(),
                })
                .returning();

            let subject: string | undefined;

            try {
                const rendered = renderTemplate(rule.template_key, event.payload);
                subject = rendered.subject;

                const messageId = await sendEmail({
                    to: email,
                    subject: rendered.subject,
                    html: rendered.html,
                });

                await db
                    .update(notificationLogs)
                    .set({ status: "SENT", sent_at: new Date(), message_id: messageId, subject })
                    .where(eq(notificationLogs.id, logEntry.id));
            } catch (err: any) {
                console.error(`[EmailHandler] Failed to send to ${email}:`, err?.message);
                await db
                    .update(notificationLogs)
                    .set({
                        status: "FAILED",
                        error_message: err?.message || "Unknown error",
                        subject: subject ?? null,
                    })
                    .where(eq(notificationLogs.id, logEntry.id));
            }
        }
    }
}
