import { and, asc, eq, isNull } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { notificationRules } from "../../../db/schema";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { getRequiredString } from "../../utils/request";

// ─── LIST RULES ───────────────────────────────────────────────────────────────
const listRules = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { event_type, company_id } = req.query;

    const conditions = [eq(notificationRules.platform_id, platformId)];
    if (event_type) conditions.push(eq(notificationRules.event_type, event_type as string));
    if (company_id === "null") conditions.push(isNull(notificationRules.company_id));
    else if (company_id) conditions.push(eq(notificationRules.company_id, company_id as string));

    const rules = await db
        .select()
        .from(notificationRules)
        .where(and(...conditions))
        .orderBy(asc(notificationRules.sort_order), asc(notificationRules.created_at));

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Notification rules fetched",
        data: rules,
    });
});

// ─── CREATE RULE ──────────────────────────────────────────────────────────────
const createRule = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const {
        event_type,
        recipient_type,
        recipient_value,
        template_key,
        company_id,
        sort_order,
        is_enabled,
    } = req.body;

    getRequiredString(event_type, "event_type");
    getRequiredString(recipient_type, "recipient_type");
    getRequiredString(template_key, "template_key");

    const [rule] = await db
        .insert(notificationRules)
        .values({
            platform_id: platformId,
            event_type,
            recipient_type,
            recipient_value: recipient_value ?? null,
            template_key,
            company_id: company_id ?? null,
            sort_order: sort_order ?? 0,
            is_enabled: is_enabled !== undefined ? is_enabled : true,
        })
        .returning();

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Notification rule created",
        data: rule,
    });
});

// ─── UPDATE RULE ──────────────────────────────────────────────────────────────
const updateRule = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const { is_enabled, template_key, sort_order } = req.body;

    const [existing] = await db
        .select()
        .from(notificationRules)
        .where(and(eq(notificationRules.id, id), eq(notificationRules.platform_id, platformId)));

    if (!existing) {
        return sendResponse(res, {
            statusCode: httpStatus.NOT_FOUND,
            success: false,
            message: "Notification rule not found",
            data: null,
        });
    }

    const updates: Partial<typeof notificationRules.$inferInsert> = { updated_at: new Date() };
    if (is_enabled !== undefined) updates.is_enabled = is_enabled;
    if (template_key !== undefined) updates.template_key = template_key;
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const [updated] = await db
        .update(notificationRules)
        .set(updates)
        .where(eq(notificationRules.id, id))
        .returning();

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Notification rule updated",
        data: updated,
    });
});

// ─── DELETE RULE ──────────────────────────────────────────────────────────────
const deleteRule = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const [existing] = await db
        .select()
        .from(notificationRules)
        .where(and(eq(notificationRules.id, id), eq(notificationRules.platform_id, platformId)));

    if (!existing) {
        return sendResponse(res, {
            statusCode: httpStatus.NOT_FOUND,
            success: false,
            message: "Notification rule not found",
            data: null,
        });
    }

    await db.delete(notificationRules).where(eq(notificationRules.id, id));

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Notification rule deleted",
        data: null,
    });
});

// ─── RESET EVENT TYPE RULES ───────────────────────────────────────────────────
const resetEventTypeRules = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const event_type = getRequiredString(req.params.event_type, "event_type");
    const { company_id } = req.query;

    const conditions = [
        eq(notificationRules.platform_id, platformId),
        eq(notificationRules.event_type, event_type),
    ];
    if (company_id) conditions.push(eq(notificationRules.company_id, company_id as string));
    else conditions.push(isNull(notificationRules.company_id));

    await db.delete(notificationRules).where(and(...conditions));

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: `Rules for ${event_type} reset`,
        data: null,
    });
});

export const NotificationRuleControllers = {
    listRules,
    createRule,
    updateRule,
    deleteRule,
    resetEventTypeRules,
};
