import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { assets, commerceRuleAcknowledgements, commerceRules } from "../../../db/schema";
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

const getAssetRuleContext = async (platformId: string, assetId: string) => {
    const [asset] = await db
        .select({
            id: assets.id,
            company_id: assets.company_id,
            brand_id: assets.brand_id,
            name: assets.name,
        })
        .from(assets)
        .where(
            and(
                eq(assets.id, assetId),
                eq(assets.platform_id, platformId),
                isNull(assets.deleted_at)
            )
        )
        .limit(1);
    if (!asset) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Target asset not found");
    }
    return asset;
};

const assertCompanionRuleContext = async (
    platformId: string,
    targetAssetId: string,
    companionAssetId: string
) => {
    const target = await getAssetRuleContext(platformId, targetAssetId);
    const companion = await getAssetRuleContext(platformId, companionAssetId);
    if (target.company_id !== companion.company_id) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Companion rules must target assets in the same company"
        );
    }
    if ((target.brand_id || null) !== (companion.brand_id || null)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Companion rules must target assets in the same brand"
        );
    }
    return target;
};

const resolveRuleCompanyId = async (
    platformId: string,
    target: CommerceRule["target"],
    predicate: CommerceRule["predicate"]
) => {
    if (predicate.kind === "COMPANION_REQUIRED") {
        return (
            await assertCompanionRuleContext(
                platformId,
                target.asset_id,
                predicate.companion_target.asset_id
            )
        ).company_id;
    }
    return (await getAssetRuleContext(platformId, target.asset_id)).company_id;
};

const createCommerceRule = async (payload: CreateCommerceRulePayload, platformId: string) => {
    const companyId = await resolveRuleCompanyId(platformId, payload.target, payload.predicate);
    const [row] = await db
        .insert(commerceRules)
        .values({
            platform_id: platformId,
            company_id: companyId,
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

    // Asset contextual filtering happens in memory — target/predicate are
    // JSONBs and volume per platform is small.
    if (filters.asset_id) {
        return rows.filter((row) => {
            const target = row.target as any;
            const predicate = row.predicate as any;
            const refs: string[] = [];
            if (target?.kind === "ASSET") refs.push(target.asset_id);
            if (predicate?.kind === "COMPANION_REQUIRED") {
                const ct = predicate.companion_target;
                if (ct?.kind === "ASSET") refs.push(ct.asset_id);
            }
            return refs.includes(filters.asset_id as string);
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

    const nextTarget = (payload.target ?? (existing.target as any)) as CommerceRule["target"];
    const nextPredicate = (payload.predicate ??
        (existing.predicate as any)) as CommerceRule["predicate"];
    const companyId =
        payload.target !== undefined || payload.predicate !== undefined
            ? await resolveRuleCompanyId(platformId, nextTarget, nextPredicate)
            : existing.company_id;

    const [row] = await db
        .update(commerceRules)
        .set({
            ...(payload.name !== undefined && { name: payload.name }),
            ...(payload.description !== undefined && {
                description: payload.description || null,
            }),
            ...(payload.rule_type !== undefined && { rule_type: payload.rule_type }),
            ...(payload.target !== undefined && { target: payload.target }),
            ...(payload.predicate !== undefined && { predicate: payload.predicate }),
            company_id: companyId,
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
        quantity: line.quantity,
    }));
    const hits = evaluatePure(cart, rules);
    return { hits };
};

const listAcknowledgements = async (
    platformId: string,
    filters: {
        entity_type: "ORDER" | "SELF_PICKUP";
        entity_id: string;
    }
) => {
    return db
        .select()
        .from(commerceRuleAcknowledgements)
        .where(
            and(
                eq(commerceRuleAcknowledgements.platform_id, platformId),
                eq(commerceRuleAcknowledgements.entity_type, filters.entity_type),
                eq(commerceRuleAcknowledgements.entity_id, filters.entity_id)
            )
        )
        .orderBy(desc(commerceRuleAcknowledgements.created_at));
};

const recordCheckoutAcknowledgementAudit = async (input: {
    platformId: string;
    entityType: "ORDER" | "SELF_PICKUP";
    entityId: string;
    user: AuthUser;
    cart: CartLine[];
    acknowledgedRuleIds?: string[];
}) => {
    const { hits } = await evaluateCart({ cart: input.cart }, input.user, input.platformId);
    if (hits.length === 0) return { inserted: 0 };

    const acknowledged = new Set(input.acknowledgedRuleIds || []);
    const ruleIds = hits.map((hit) => hit.rule_id);
    const rows = await db
        .select({
            id: commerceRules.id,
            rule_type: commerceRules.rule_type,
        })
        .from(commerceRules)
        .where(inArray(commerceRules.id, ruleIds));
    const typeByRuleId = new Map(rows.map((row) => [row.id, row.rule_type]));

    await db.insert(commerceRuleAcknowledgements).values(
        hits.map((hit) => {
            const isAcknowledged = acknowledged.has(hit.rule_id);
            return {
                platform_id: input.platformId,
                entity_type: input.entityType,
                entity_id: input.entityId,
                rule_id: hit.rule_id,
                rule_name: hit.rule_name,
                rule_type: (typeByRuleId.get(hit.rule_id) || "QUANTITY") as any,
                severity: hit.severity as any,
                message: hit.message,
                related_asset_id: hit.related_asset_id || null,
                acknowledged: isAcknowledged,
                acknowledged_by: isAcknowledged ? input.user.id : null,
                acknowledged_at: isAcknowledged ? new Date() : null,
                cart_snapshot: input.cart,
                hit_snapshot: hit,
            };
        })
    );

    return { inserted: hits.length };
};

export const CommerceRulesServices = {
    createCommerceRule,
    listCommerceRules,
    updateCommerceRule,
    deleteCommerceRule,
    evaluateCart,
    listAcknowledgements,
    recordCheckoutAcknowledgementAudit,
};
