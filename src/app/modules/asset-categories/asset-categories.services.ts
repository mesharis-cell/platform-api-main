import { and, asc, count, eq, isNull, or } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { assetCategories, assetFamilies } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { generateRandomCategoryColor } from "../../utils/color";
import { findNearMatches } from "../../utils/levenshtein";

const slugify = (name: string): string =>
    name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 120);

const listCategories = async (platformId: string, companyId?: string | null) => {
    const conditions = [
        eq(assetCategories.platform_id, platformId),
        eq(assetCategories.is_active, true),
    ];

    const visibilityCondition = companyId
        ? or(isNull(assetCategories.company_id), eq(assetCategories.company_id, companyId))
        : isNull(assetCategories.company_id);

    const rows = await db
        .select({
            id: assetCategories.id,
            platform_id: assetCategories.platform_id,
            company_id: assetCategories.company_id,
            name: assetCategories.name,
            slug: assetCategories.slug,
            color: assetCategories.color,
            sort_order: assetCategories.sort_order,
            is_active: assetCategories.is_active,
            created_at: assetCategories.created_at,
        })
        .from(assetCategories)
        .where(and(...conditions, visibilityCondition))
        .orderBy(asc(assetCategories.sort_order), asc(assetCategories.name));

    return rows;
};

const createCategory = async (
    platformId: string,
    payload: { name: string; color?: string; company_id?: string | null },
    createdBy?: string
) => {
    const slug = slugify(payload.name);
    if (!slug) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Category name produces an empty slug");
    }

    const color = payload.color || generateRandomCategoryColor();
    const companyId = payload.company_id || null;

    // Check uniqueness within scope
    const scopeConditions = [
        eq(assetCategories.platform_id, platformId),
        eq(assetCategories.slug, slug),
    ];
    if (companyId) {
        scopeConditions.push(eq(assetCategories.company_id, companyId));
    } else {
        scopeConditions.push(isNull(assetCategories.company_id));
    }

    const [existing] = await db
        .select({ id: assetCategories.id })
        .from(assetCategories)
        .where(and(...scopeConditions))
        .limit(1);

    if (existing) {
        throw new CustomizedError(httpStatus.CONFLICT, "A category with this name already exists");
    }

    const [row] = await db
        .insert(assetCategories)
        .values({
            platform_id: platformId,
            company_id: companyId,
            name: payload.name.trim(),
            slug,
            color,
            created_by: createdBy || null,
        })
        .returning();

    return row;
};

const createCategoryInTransaction = async (
    executor: any,
    platformId: string,
    payload: { name: string; color?: string; company_id?: string | null },
    createdBy?: string
) => {
    const slug = slugify(payload.name);
    if (!slug) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Category name produces an empty slug");
    }

    const color = payload.color || generateRandomCategoryColor();
    const companyId = payload.company_id || null;

    const scopeConditions = [
        eq(assetCategories.platform_id, platformId),
        eq(assetCategories.slug, slug),
    ];
    if (companyId) {
        scopeConditions.push(eq(assetCategories.company_id, companyId));
    } else {
        scopeConditions.push(isNull(assetCategories.company_id));
    }

    const [existing] = await executor
        .select({ id: assetCategories.id })
        .from(assetCategories)
        .where(and(...scopeConditions))
        .limit(1);

    if (existing) {
        throw new CustomizedError(httpStatus.CONFLICT, "A category with this name already exists");
    }

    const [row] = await executor
        .insert(assetCategories)
        .values({
            platform_id: platformId,
            company_id: companyId,
            name: payload.name.trim(),
            slug,
            color,
            created_by: createdBy || null,
        })
        .returning();

    return row;
};

const updateCategory = async (
    id: string,
    platformId: string,
    payload: { name?: string; color?: string; sort_order?: number; is_active?: boolean }
) => {
    const [existing] = await db
        .select()
        .from(assetCategories)
        .where(and(eq(assetCategories.id, id), eq(assetCategories.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Category not found");
    }

    const updateData: Record<string, unknown> = {};

    if (payload.name !== undefined) {
        const newSlug = slugify(payload.name);
        if (!newSlug) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Category name produces an empty slug"
            );
        }

        // Check uniqueness for the new slug
        const scopeConditions = [
            eq(assetCategories.platform_id, platformId),
            eq(assetCategories.slug, newSlug),
        ];
        if (existing.company_id) {
            scopeConditions.push(eq(assetCategories.company_id, existing.company_id));
        } else {
            scopeConditions.push(isNull(assetCategories.company_id));
        }

        const [conflict] = await db
            .select({ id: assetCategories.id })
            .from(assetCategories)
            .where(and(...scopeConditions))
            .limit(1);

        if (conflict && conflict.id !== id) {
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "A category with this name already exists"
            );
        }

        updateData.name = payload.name.trim();
        updateData.slug = newSlug;
    }

    if (payload.color !== undefined) updateData.color = payload.color;
    if (payload.sort_order !== undefined) updateData.sort_order = payload.sort_order;
    if (payload.is_active !== undefined) updateData.is_active = payload.is_active;

    if (Object.keys(updateData).length === 0) {
        return existing;
    }

    const [updated] = await db
        .update(assetCategories)
        .set(updateData)
        .where(eq(assetCategories.id, id))
        .returning();

    return updated;
};

const deleteCategory = async (id: string, platformId: string) => {
    const [existing] = await db
        .select()
        .from(assetCategories)
        .where(and(eq(assetCategories.id, id), eq(assetCategories.platform_id, platformId)))
        .limit(1);

    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Category not found");
    }

    // Guard: reject if families reference this category
    const [familyCount] = await db
        .select({ count: count() })
        .from(assetFamilies)
        .where(and(eq(assetFamilies.category_id, id), isNull(assetFamilies.deleted_at)));

    if (Number(familyCount?.count || 0) > 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot delete — ${familyCount.count} asset families use this category. Reassign them first.`
        );
    }

    await db.delete(assetCategories).where(eq(assetCategories.id, id));
    return { deleted: true };
};

const checkTypoMatches = async (
    platformId: string,
    companyId: string | null,
    name: string
): Promise<Array<{ name: string; distance: number }>> => {
    const existing = await listCategories(platformId, companyId);
    return findNearMatches(
        name,
        existing.map((c) => c.name)
    );
};

export const AssetCategoryServices = {
    listCategories,
    createCategory,
    createCategoryInTransaction,
    updateCategory,
    deleteCategory,
    checkTypoMatches,
};
