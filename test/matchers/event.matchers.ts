import { and, eq } from "drizzle-orm";
import { db } from "../support/db";
import { systemEvents } from "../../src/db/schema";

type MatcherResult = { pass: boolean; message: () => string };

export const toHaveEmittedEvent = async (
    entityId: string,
    eventType: string
): Promise<MatcherResult> => {
    const rows = await db
        .select({ id: systemEvents.id, actor_role: systemEvents.actor_role })
        .from(systemEvents)
        .where(
            and(eq(systemEvents.entity_id, entityId), eq(systemEvents.event_type, eventType))
        )
        .limit(1);
    return {
        pass: rows.length > 0,
        message: () =>
            rows.length > 0
                ? `expected entity ${entityId} NOT to have emitted event "${eventType}", but it did`
                : `expected entity ${entityId} to have emitted event "${eventType}", but no matching system_events row was found`,
    };
};
