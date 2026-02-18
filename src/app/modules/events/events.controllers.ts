import { and, desc, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { systemEvents } from "../../../db/schema";
import type { EntityType } from "../../events/event-types";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";

const listEvents = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { event_type, entity_type, entity_id, limit = "50", offset = "0" } = req.query;

    const conditions = [eq(systemEvents.platform_id, platformId)];
    if (event_type) conditions.push(eq(systemEvents.event_type, event_type as string));
    if (entity_type) conditions.push(eq(systemEvents.entity_type, entity_type as EntityType));
    if (entity_id) conditions.push(eq(systemEvents.entity_id, entity_id as string));

    const events = await db
        .select()
        .from(systemEvents)
        .where(and(...conditions))
        .orderBy(desc(systemEvents.occurred_at))
        .limit(parseInt(limit as string))
        .offset(parseInt(offset as string));

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Events fetched",
        data: {
            events,
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
        },
    });
});

export const EventsControllers = { listEvents };
