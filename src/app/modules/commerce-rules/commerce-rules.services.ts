import { and, desc, eq, isNull, or } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { commerceRules } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import {
    CommerceRule,
    CartLine,
    evaluateCommerceRules as evaluatePure,
} from "../../utils/commerce-rules-evaluator";
import {
    CreateCommerceRulePayload,
    EvaluateCommerceRulesPayload,
    UpdateCommerceRulePayload,
} from "./commerce-rules.schemas";

const projectRule = (row: typeof commerceRules.$inferSelect): CommerceRule => ({
    id: row.id,
    name: row.name,
    rule_type: row.rule_type,
    severity: row.severity,
    target: row.target as any,
    predicate: row.predicate as any,
    message: row.message,
});

const createCommerceRule = async (payload: CreateCommerceRulePayload, platformId: string) => {
    const [row] = await db
        .insert(commerceRules)
        .values({
            platform_id: platformId,
            company_id: payload.company_id ?? null,
            name: payload.name,
            description: payload.description || null,
            rule_type: payload.rule_type,
            severity: payload.severity,
            target: payload.target,
            predicate: payload.predicate,
            message: payload.message,
            is_active: payload.is_active ?? true,
        })
        .returning();
    return row;
};

const listCommerceRules = async (
    platformId: string,
    filters: {
        company_id?: string;
        asset_id?: string;
        group_id?: string;
        include_inactive?: boolean;
    }
) => {
    const conditions: any[] = [
        eq(commerceRules.platform_id, platformId),
        isNull(commerceRules.deleted_at),
    ];
    if (!filters.include_inactive) {
        conditions.push(eq(commerceRules.is_active, true));
    }
    if (filters.company_id) {
        conditions.push(eq(commerceRules.company_id, filters.company_id));
    }

    const rows = await db
        .select()
        .from(commerceRules)
        .where(and(...conditions))
        .orderBy(desc(commerceRules.created_at));

    // Asset / group contextual filtering happens in memory — the target
    // and predicate are JSONBs so a SQL filter would be awkward, and the
    // volume per platform is small.
    if (filters.asset_id || filters.group_id) {
        return rows.filter((row) => {
            const target = row.target as any;
            const predicate = row.predicate as any;
            const refs: string[] = [];
            if (target?.kind === "ASSET") refs.push(target.asset_id);
            if (target?.kind === "GROUP") refs.push(target.group_id);
            if (predicate?.kind === "COMPANION_REQUIRED") {
                const ct = predicate.companion_target;
                if (ct?.kind === "ASSET") refs.push(ct.asset_id);
                if (ct?.kind === "GROUP") refs.push(ct.group_id);
            }
            if (filters.asset_id && refs.includes(filters.asset_id)) return true;
            if (filters.group_id && refs.includes(filters.group_id)) return true;
            return false;
        });
    }

    return rows;
};

const updateCommerceRule = async (
    id: string,
    payload: UpdateCommerceRulePayload,
    platformId: string
) => {
    const [existing] = await db
        .select()
        .from(commerceRules)
        .where(
            and(
                eq(commerceRules.id, id),
                eq(commerceRules.platform_id, platformId),
                isNull(commerceRules.deleted_at)
            )
        )
        .limit(1);

    if (!existing) throw new CustomizedError(httpStatus.NOT_FOUND, "Commerce rule not found");

    const [row] = await db
        .update(commerceRules)
        .set({
            ...(payload.name !== undefined && { name: payload.name }),
            ...(payload.description !== undefined && {
                description: payload.description || null,
            }),
            ...(payload.target !== undefined && { target: payload.target }),
            ...(payload.predicate !== undefined && { predicate: payload.predicate }),
            ...(payload.message !== undefined && { message: payload.message }),
            ...(payload.is_active !== undefined && { is_active: payload.is_active }),
            updated_at: new Date(),
        })
        .where(eq(commerceRules.id, id))
        .returning();
    return row;
};

const deleteCommerceRule = async (id: string, platformId: string) => {
    const [existing] = await db
        .select({ id: commerceRules.id })
        .from(commerceRules)
        .where(
            and(
                eq(commerceRules.id, id),
                eq(commerceRules.platform_id, platformId),
                isNull(commerceRules.deleted_at)
            )
        )
        .limit(1);
    if (!existing) throw new CustomizedError(httpStatus.NOT_FOUND, "Commerce rule not found");
    await db
        .update(commerceRules)
        .set({ deleted_at: new Date(), is_active: false })
        .where(eq(commerceRules.id, id));
    return { id };
};

const evaluateCart = async (
    payload: EvaluateCommerceRulesPayload,
    user: AuthUser,
    platformId: string
) => {
    // Resolve the rule set: UNION of platform-wide rules + caller-company-
    // specific rules. CLIENT callers can only see their own company's
    // overrides; admins can hit /evaluate for any cart but defaults match
    // the caller's company too.
    const callerCompanyId = user.company_id || null;

    const conditions: any[] = [
        eq(commerceRules.platform_id, platformId),
        isNull(commerceRules.deleted_at),
        eq(commerceRules.is_active, true),
    ];

    const scopeCondition = callerCompanyId
        ? or(isNull(commerceRules.company_id), eq(commerceRules.company_id, callerCompanyId))
        : isNull(commerceRules.company_id);

    const rows = await db
        .select()
        .from(commerceRules)
        .where(and(...conditions, scopeCondition));

    const rules: CommerceRule[] = rows.map(projectRule);
    const cart: CartLine[] = payload.cart.map((line) => ({
        asset_id: line.asset_id,
        group_id: line.group_id || null,
        quantity: line.quantity,
    }));
    const hits = evaluatePure(cart, rules);
    return { hits };
};

export const CommerceRulesServices = {
    createCommerceRule,
    listCommerceRules,
    updateCommerceRule,
    deleteCommerceRule,
    evaluateCart,
};
