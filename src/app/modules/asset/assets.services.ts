import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { moveS3Object, s3KeyFromUrl } from "../../services/s3.service";
import httpStatus from "http-status";
import QRCode from "qrcode";
import { db } from "../../../db";
import {
    assetBookings,
    assetConditionHistory,
    assetVersions,
    assets,
    brands,
    companies,
    orders,
    scanEventAssets,
    scanEventMedia,
    scanEvents,
    selfPickups,
    serviceRequests,
    selfBookingItems,
    teams,
    users,
    warehouses,
    zones,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { assertCompanyScopeOrManager } from "../../utils/company-scope";
import paginationMaker from "../../utils/pagination-maker";
import { qrCodeGenerator } from "../../utils/qr-code-generator";
import queryValidator from "../../utils/query-validator";
import {
    AddConditionHistoryPayload,
    AddAssetUnitsPayload,
    CreateAssetPayload,
    GenerateQRCodePayload,
    UpdateAssetConditionPayload,
} from "./assets.interfaces";
import { assetQueryValidationConfig, assetSortableFields } from "./assets.utils";
import * as AvailabilityCore from "../../shared/availability/availability.core";

// Moves any draft S3 images to permanent {companyId}/assets/ path
// Image jsonb entries carry an optional `source` tag (CLIENT | SCAN). The type
// is widened here so the tag survives promotion (the runtime `...img` spread
// already preserves it; the previous narrow type silently dropped it at compile
// time). See assetImageSchema in asset.schemas.ts.
type AssetImageEntry = { url: string; note?: string; source?: "CLIENT" | "SCAN" };

const promoteDraftImages = async (
    images: AssetImageEntry[],
    companyId: string
): Promise<AssetImageEntry[]> => {
    return Promise.all(
        images.map(async (img) => {
            if (!img.url.includes("/drafts/")) return img;
            const fromKey = s3KeyFromUrl(img.url);
            const filename = fromKey.split("/").pop() ?? fromKey;
            const toKey = `images/${companyId}/assets/${Date.now()}-${filename}`;
            const newUrl = await moveS3Object(fromKey, toKey);
            return { ...img, url: newUrl };
        })
    );
};

// Default untagged image entries to source:'CLIENT' (catalogue) while PRESERVING
// any explicit existing tag. So a fresh catalogue upload becomes CLIENT, but a
// pre-existing SCAN entry round-tripping through an admin edit stays SCAN (never
// re-tagged) — without this the scan merge would treat it as a client photo.
// CLIENT-tagged entries are never treated as replaceable scan media, and the tag
// is the deterministic seed for the catalogue/scan split migration.
const tagImagesClient = (images: unknown): AssetImageEntry[] =>
    (Array.isArray(images) ? (images as AssetImageEntry[]) : []).map((img) =>
        img?.source === "SCAN" || img?.source === "CLIENT"
            ? img
            : { ...img, source: "CLIENT" as const }
    );

// Reconcile an incoming images array against the row's stored images, recovering
// each entry's `source` by URL when the caller didn't send one. This makes the
// tag robust against frontend edit surfaces that rebuild image objects as
// {url, note} and drop `source` (admin/warehouse edit dialogs, inline reorder):
// an existing SCAN photo round-tripping through such a save keeps SCAN; a brand
// new upload (its draft URL already promoted to a fresh permanent URL, so it
// won't match any stored entry) defaults to CLIENT.
const reconcileImageSources = (incoming: unknown, stored: unknown): AssetImageEntry[] => {
    const prior = new Map<string, "CLIENT" | "SCAN">();
    (Array.isArray(stored) ? (stored as AssetImageEntry[]) : []).forEach((entry) => {
        if (entry?.url && (entry.source === "CLIENT" || entry.source === "SCAN")) {
            prior.set(entry.url, entry.source);
        }
    });
    return (Array.isArray(incoming) ? (incoming as AssetImageEntry[]) : []).map((img) => {
        if (img?.source === "SCAN" || img?.source === "CLIENT") return img;
        const known = img?.url ? prior.get(img.url) : undefined;
        return { ...img, source: known ?? ("CLIENT" as const) };
    });
};

// ═══════════════════════════════════════════════════════════════════════════
// GROUP HELPERS (post-squash)
// ═══════════════════════════════════════════════════════════════════════════
//
// Groups are not a separate entity. They are a correlation on the assets table:
// assets sharing a `group_id` are siblings of the same product. Every asset
// also carries `group_name` (denormalized) — the display label used on the
// catalog group card.
//
// Group invariants (enforced at service layer; no DB CHECK):
//   1. group_id IS NULL ⟺ group_name IS NULL  (raw assets have no group).
//   2. Siblings within a group share company_id, brand_id, stock_mode.
//   3. group_name is unique per company at the *group* level (distinct group_ids
//      cannot share a name within one company).
//   4. group_name + group presentation media cascade across siblings; drift is
//      treated as invalid application state.

/**
 * Validates that a candidate asset's company/brand/stock_mode is compatible
 * with the existing siblings of a target group. Throws on mismatch.
 *
 * Pass `excludeAssetId` when validating an UPDATE (to skip checking the asset
 * being modified against itself).
 */
const validateGroupSiblingConstraints = async (
    tx: any,
    {
        groupId,
        platformId,
        companyId,
        brandId,
        stockMode,
        excludeAssetId,
    }: {
        groupId: string;
        platformId: string;
        companyId: string;
        brandId: string | null;
        stockMode: "SERIALIZED" | "POOLED";
        excludeAssetId?: string;
    }
) => {
    const conditions = [
        eq(assets.group_id, groupId),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];
    if (excludeAssetId) conditions.push(ne(assets.id, excludeAssetId));

    const sibling = await tx.query.assets.findFirst({
        where: and(...conditions),
        columns: { company_id: true, brand_id: true, stock_mode: true },
    });

    if (!sibling) return; // empty group (or only the excluded asset) — no constraint to check

    if (sibling.company_id !== companyId) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Group siblings must share the same company"
        );
    }
    if ((sibling.brand_id ?? null) !== (brandId ?? null)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Group siblings must share the same brand"
        );
    }
    if (sibling.stock_mode !== stockMode) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Group siblings must share the same stock_mode (SERIALIZED or POOLED)"
        );
    }
};

/**
 * Validates that no OTHER group_id in the same company is using the supplied
 * group_name. Service-layer enforcement only — DB cannot use a standard unique
 * index because group_name is denormalized onto every sibling row. Acceptable
 * race window for concurrent group creates.
 *
 * Pass `currentGroupId` so siblings of the same group aren't counted as conflicts.
 */
const validateGroupNameUniqueness = async (
    tx: any,
    {
        platformId,
        companyId,
        groupName,
        currentGroupId,
    }: {
        platformId: string;
        companyId: string;
        groupName: string;
        currentGroupId: string | null;
    }
) => {
    const conditions = [
        eq(assets.platform_id, platformId),
        eq(assets.company_id, companyId),
        eq(assets.group_name, groupName),
        isNull(assets.deleted_at),
    ];
    if (currentGroupId) {
        conditions.push(ne(assets.group_id, currentGroupId));
    }

    const conflict = await tx.query.assets.findFirst({
        where: and(...conditions),
        columns: { id: true, group_id: true },
    });

    if (conflict && conflict.group_id !== null) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Group name "${groupName}" is already in use by another group in this company`
        );
    }
};

const resolveCreateAssetData = async (data: CreateAssetPayload) => {
    if (!data.company_id) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "company_id is required");
    }
    if (!data.stock_mode) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "stock_mode is required");
    }
    if (data.weight_per_unit === undefined || data.weight_per_unit === null) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "weight_per_unit is required");
    }
    if (data.volume_per_unit === undefined || data.volume_per_unit === null) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "volume_per_unit is required");
    }

    const category = data.category ?? "Unknown";
    const totalQuantity = data.total_quantity ?? 1;
    const availableQuantity = data.available_quantity ?? totalQuantity;
    const packaging = data.packaging ?? null;
    if (data.stock_mode === "POOLED" && !packaging) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Packaging description is required for POOLED stock_mode"
        );
    }
    if (data.low_stock_threshold != null && data.stock_mode !== "POOLED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Low-stock threshold is only supported for POOLED assets"
        );
    }

    // Group resolution. Returns groupId + groupName + the sibling-index start
    // for asset.name suffixing (the createAsset caller does the per-unit suffix
    // inside its loop or single-create path).
    //
    //   - group_id provided ⟶ join existing group; copy group_name from a sibling;
    //     siblingIndexStart = current sibling count + 1.
    //   - is_part_of_group=true (default) + no group_id ⟶ create a new group;
    //     group_name = data.name; siblingIndexStart = 1.
    //   - is_part_of_group=false + no group_id ⟶ raw asset; no suffix.
    let groupId: string | null = data.group_id ?? null;
    let groupName: string | null = null;
    let groupImages: { url: string; note?: string }[] = [];
    let groupOnDisplayImage: string | null = null;
    let siblingIndexStart: number | null = null;

    if (groupId) {
        const sibling = await db.query.assets.findFirst({
            where: and(
                eq(assets.group_id, groupId),
                eq(assets.platform_id, data.platform_id),
                isNull(assets.deleted_at)
            ),
            columns: { group_name: true, group_images: true, group_on_display_image: true },
        });
        if (!sibling) {
            throw new CustomizedError(
                httpStatus.NOT_FOUND,
                "Target group not found (no live siblings)"
            );
        }
        groupName = sibling.group_name;
        groupImages = Array.isArray(sibling.group_images)
            ? (sibling.group_images as { url: string; note?: string }[])
            : [];
        groupOnDisplayImage = sibling.group_on_display_image ?? null;
        const siblingCountRows = await db
            .select({ c: sql<number>`COUNT(*)::int` })
            .from(assets)
            .where(
                and(
                    eq(assets.group_id, groupId),
                    eq(assets.platform_id, data.platform_id),
                    isNull(assets.deleted_at)
                )
            );
        siblingIndexStart = (siblingCountRows[0]?.c ?? 0) + 1;
    } else if (data.is_part_of_group !== false) {
        groupId = randomUUID();
        groupName = data.name;
        groupImages = data.group_images ?? [];
        groupOnDisplayImage = data.group_on_display_image ?? null;
        siblingIndexStart = 1;
    }
    // else: raw asset, groupId + groupName + siblingIndexStart stay null

    return {
        ...data,
        company_id: data.company_id,
        brand_id: data.brand_id ?? null,
        team_id: data.team_id ?? null,
        group_id: groupId,
        group_name: groupName,
        // Catalogue uploads are tagged source:'CLIENT' so the inbound scan merge
        // never treats them as replaceable scan media (and the catalogue/scan
        // split migration can partition deterministically on `source`).
        group_images: groupId ? tagImagesClient(groupImages) : [],
        group_on_display_image: groupId ? groupOnDisplayImage : null,
        sibling_index_start: siblingIndexStart, // consumed by createAsset; not stored on row
        // name stays as base (data.name); createAsset suffixes per-unit
        category,
        description: data.description ?? undefined,
        images: tagImagesClient(data.images),
        on_display_image: data.on_display_image ?? null,
        stock_mode: data.stock_mode,
        total_quantity: totalQuantity,
        available_quantity: availableQuantity,
        packaging,
        weight_per_unit: data.weight_per_unit,
        dimensions: data.dimensions ?? {},
        volume_per_unit: data.volume_per_unit,
        handling_tags: data.handling_tags ?? [],
        low_stock_threshold: data.low_stock_threshold ?? null,
    };
};

// ----------------------------------- CREATE ASSET ---------------------------------------
const createAsset = async (input: CreateAssetPayload, user: AuthUser) => {
    try {
        const data = await resolveCreateAssetData(input);

        // Step 1: Validate company, warehouse and zone exists and is not archived
        const [[company], [warehouse], [zone]] = await Promise.all([
            db
                .select()
                .from(companies)
                .where(
                    and(
                        eq(companies.id, data.company_id),
                        eq(companies.platform_id, data.platform_id),
                        isNull(companies.deleted_at)
                    )
                ),
            db
                .select()
                .from(warehouses)
                .where(
                    and(
                        eq(warehouses.id, data.warehouse_id),
                        eq(warehouses.platform_id, data.platform_id)
                    )
                ),
            db
                .select()
                .from(zones)
                .where(and(eq(zones.id, data.zone_id), eq(zones.warehouse_id, data.warehouse_id))),
        ]);

        if (!company) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found or is archived");
        }

        if (!warehouse) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Warehouse not found");
        }

        if (!zone) {
            throw new CustomizedError(
                httpStatus.NOT_FOUND,
                "Zone not found or does not belong to the specified warehouse and company"
            );
        }

        // Step 2: Validate brand if provided
        if (data.brand_id) {
            const [brand] = await db
                .select()
                .from(brands)
                .where(and(eq(brands.id, data.brand_id), eq(brands.company_id, data.company_id)));

            if (!brand) {
                throw new CustomizedError(
                    httpStatus.NOT_FOUND,
                    "Brand not found or does not belong to the specified company"
                );
            }
        }

        // Step 2b: Validate team if provided
        if (data.team_id) {
            const [team] = await db
                .select()
                .from(teams)
                .where(
                    and(
                        eq(teams.id, data.team_id),
                        eq(teams.company_id, data.company_id),
                        eq(teams.platform_id, data.platform_id)
                    )
                );

            if (!team) {
                throw new CustomizedError(
                    httpStatus.NOT_FOUND,
                    "Team not found or does not belong to the specified company"
                );
            }
        }

        // Validate group invariants if joining an existing group OR creating a new
        // one with a supplied name. (Cross-group name uniqueness, sibling shape.)
        if (data.group_id && data.sibling_index_start && data.sibling_index_start > 1) {
            // Joining an existing group — validate sibling shape against the candidate
            await validateGroupSiblingConstraints(db, {
                groupId: data.group_id,
                platformId: data.platform_id,
                companyId: data.company_id,
                brandId: data.brand_id,
                stockMode: data.stock_mode,
            });
        }
        if (data.group_id && data.group_name) {
            await validateGroupNameUniqueness(db, {
                platformId: data.platform_id,
                companyId: data.company_id,
                groupName: data.group_name,
                currentGroupId: data.group_id,
            });
        }

        // Promote any draft S3 images to permanent paths
        if (Array.isArray(data.images) && data.images.length > 0)
            data.images = await promoteDraftImages(
                data.images as { url: string; note?: string }[],
                data.company_id
            );
        if (Array.isArray(data.group_images) && data.group_images.length > 0)
            data.group_images = await promoteDraftImages(
                data.group_images as { url: string; note?: string }[],
                data.company_id
            );

        // Promote condition photos (also uploaded as drafts)
        if (data.condition_photos && data.condition_photos.length > 0)
            data.condition_photos = await Promise.all(
                data.condition_photos.map(async (url) => {
                    if (!url.includes("/drafts/")) return url;
                    const fromKey = s3KeyFromUrl(url);
                    const filename = fromKey.split("/").pop() ?? fromKey;
                    const toKey = `images/${data.company_id}/assets/${Date.now()}-${filename}`;
                    return moveS3Object(fromKey, toKey);
                })
            );

        // Step 3: Handle SERIALIZED with quantity > 1 — create N separate asset rows.
        // For SERIALIZED+qty>1 we ALWAYS force grouping (even if is_part_of_group was
        // false), since multiple distinct units of the same name only make sense as
        // siblings. resolveCreateAssetData ensures group_id is set when is_part_of_group
        // is true (default); we override here to make qty>1 always grouped.
        if (data.stock_mode === "SERIALIZED" && data.total_quantity > 1) {
            // Force grouping if caller opted out — qty>1 implies siblings
            const effectiveGroupId = data.group_id ?? randomUUID();
            const effectiveGroupName = data.group_name ?? data.name;
            const indexStart = data.sibling_index_start ?? 1;
            const createdAssets: any[] = [];

            for (let i = 0; i < data.total_quantity; i++) {
                // Generate unique QR code for each unit
                const qrCode = await qrCodeGenerator(data.company_id);

                // Create individual asset with quantity=1
                const [asset] = await db
                    .insert(assets)
                    .values({
                        platform_id: data.platform_id,
                        company_id: data.company_id,
                        warehouse_id: data.warehouse_id,
                        zone_id: data.zone_id,
                        brand_id: data.brand_id || null,
                        group_id: effectiveGroupId,
                        group_name: effectiveGroupName,
                        group_images: data.group_images || [],
                        group_on_display_image: data.group_on_display_image || null,
                        team_id: data.team_id ?? null,
                        name: `${data.name} #${indexStart + i}`,
                        description: data.description || null,
                        category: data.category,
                        images: data.images || [],
                        on_display_image: data.on_display_image || null,
                        stock_mode: "SERIALIZED",
                        total_quantity: 1,
                        available_quantity: 1,
                        qr_code: qrCode,
                        packaging: null,
                        weight_per_unit: data.weight_per_unit.toString(),
                        dimensions: data.dimensions || {},
                        volume_per_unit: data.volume_per_unit.toString(),
                        condition: data.condition || "GREEN",
                        condition_notes: data.condition_notes || null,
                        refurb_days_estimate: data.refurb_days_estimate || null,
                        handling_tags: data.handling_tags || [],
                        status: data.status || "AVAILABLE",
                        low_stock_threshold: data.low_stock_threshold ?? null,
                    })
                    .returning();

                // Create initial condition history entry in table
                if (data.condition_notes || (data.condition && data.condition !== "GREEN")) {
                    await db.insert(assetConditionHistory).values({
                        platform_id: data.platform_id,
                        asset_id: asset.id,
                        condition: data.condition || "GREEN",
                        notes: data.condition_notes || "Initial condition",
                        photos: data.condition_photos ?? [],
                        updated_by: user.id,
                    });
                }

                createdAssets.push(asset);
            }

            // Create version 1 snapshots for all created assets
            for (const ca of createdAssets) {
                await createAssetVersionSnapshot(ca.id, ca.platform_id, "Created", user.id);
            }

            return {
                ...createdAssets[0],
                meta: {
                    assets_created: createdAssets.length,
                    message: `Created ${createdAssets.length} individual assets`,
                },
            };
        }

        // Step 4: SERIALIZED qty=1 OR POOLED — create single asset row.
        // Apply group #1 suffix if we're creating a new group via the wizard's
        // "Part of a group" toggle (sibling_index_start === 1 means new group).
        const qrCode = await qrCodeGenerator(data.company_id);
        const finalName =
            data.group_id && data.group_name
                ? `${data.name} #${data.sibling_index_start ?? 1}`
                : data.name;

        // Strip the transient sibling_index_start before INSERT — it's not a column.
        const { sibling_index_start: _sis, is_part_of_group: _ipog, ...rest } = data as any;

        const dbData = {
            ...rest,
            qr_code: qrCode,
            name: finalName,
            weight_per_unit: data.weight_per_unit.toString(),
            volume_per_unit: data.volume_per_unit.toString(),
            brand_id: data.brand_id || null,
            group_id: data.group_id ?? null,
            group_name: data.group_name ?? null,
            group_images: data.group_id ? data.group_images || [] : [],
            group_on_display_image: data.group_id ? data.group_on_display_image || null : null,
            team_id: data.team_id ?? null,
            description: data.description || null,
            images: data.images || [],
            on_display_image: data.on_display_image || null,
            packaging: data.packaging || null,
            dimensions: data.dimensions || {},
            condition: data.condition || "GREEN",
            condition_notes: data.condition_notes || null,
            refurb_days_estimate: data.refurb_days_estimate || null,
            handling_tags: data.handling_tags || [],
            status: data.status || "AVAILABLE",
            low_stock_threshold: data.low_stock_threshold ?? null,
        };

        const [result] = await db.insert(assets).values(dbData).returning();

        // Create initial condition history entry in table
        if (data.condition_notes || (data.condition && data.condition !== "GREEN")) {
            await db.insert(assetConditionHistory).values({
                platform_id: data.platform_id,
                asset_id: result.id,
                condition: data.condition || "GREEN",
                notes: data.condition_notes || "Initial condition",
                photos: data.condition_photos ?? [],
                updated_by: user.id,
            });
        }

        // Create version 1 snapshot
        await createAssetVersionSnapshot(result.id, data.platform_id, "Created", user.id);

        return result;
    } catch (error: any) {
        // Step 5: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === "23505") {
            if (pgError.constraint === "assets_qr_code_key") {
                throw new CustomizedError(httpStatus.CONFLICT, `Duplicate QR code found`);
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "An asset with these details already exists"
            );
        }

        throw error;
    }
};

// ----------------------------------- GET ASSETS -----------------------------------------
const getAssets = async (query: Record<string, any>, user: AuthUser, platformId: string) => {
    const {
        search_term,
        page,
        limit,
        sort_by,
        sort_order,
        company_id,
        group_id,
        warehouse_id,
        zone_id,
        brand_id,
        category,
        stock_mode,
        condition,
        status,
        include_inactive,
    } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(assetQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(assetQueryValidationConfig, "sort_order", sort_order);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } = paginationMaker({
        page,
        limit,
        sort_by,
        sort_order,
    });

    // Step 3: Build WHERE conditions
    const conditions: any[] = [eq(assets.platform_id, platformId)];

    // Step 3a: Filter by user role (CLIENT users see only their company's assets)
    if (user.role === "CLIENT") {
        if (user.company_id) {
            conditions.push(eq(assets.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3b: Search by asset name, QR code, or group name
    if (search_term) {
        const term = `%${search_term.trim()}%`;
        conditions.push(
            or(
                ilike(assets.name, term),
                ilike(assets.qr_code, term),
                ilike(assets.group_name, term)
            )
        );
    }

    // Step 3c: Filter by company ID
    if (company_id) {
        conditions.push(eq(assets.company_id, company_id));
    }

    // Step 3d: Filter by group ID (siblings filter for "View all in group" navigation)
    if (group_id) {
        conditions.push(eq(assets.group_id, group_id));
    }

    // Step 3e: Filter by warehouse ID
    if (warehouse_id) {
        conditions.push(eq(assets.warehouse_id, warehouse_id));
    }

    // Step 3f: Filter by zone ID
    if (zone_id) {
        conditions.push(eq(assets.zone_id, zone_id));
    }

    // Step 3g: Filter by brand ID
    if (brand_id) {
        conditions.push(eq(assets.brand_id, brand_id));
    }

    // Step 3h: Filter by category
    if (category) {
        conditions.push(eq(assets.category, category));
    }

    // Step 3i: Filter by stock_mode (SERIALIZED | POOLED)
    if (stock_mode) {
        conditions.push(eq(assets.stock_mode, stock_mode));
    }

    // Step 3j: Filter by condition (supports multiple values: GREEN,ORANGE,RED)
    if (condition) {
        // Check if condition contains comma (multiple values)
        if (condition.includes(",")) {
            // Split by comma and trim whitespace
            const conditionArray = condition.split(",").map((c: string) => c.trim());
            conditions.push(inArray(assets.condition, conditionArray));
        } else {
            // Single condition value
            conditions.push(eq(assets.condition, condition));
        }
    }

    // Step 3k: Filter by status
    if (status) {
        conditions.push(eq(assets.status, status));
    }

    // Step 3l: Filter by deleted status (default: only active assets)
    if (include_inactive !== "true") {
        conditions.push(isNull(assets.deleted_at));
    }

    // Step 4: Determine sort order
    const orderByColumn = assetSortableFields[sortWith] || assets.created_at;
    const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    // Step 5: Execute queries in parallel (data + count)
    const [result, total] = await Promise.all([
        db.query.assets.findMany({
            where: and(...conditions),
            with: {
                company: {
                    columns: {
                        id: true,
                        name: true,
                        domain: true,
                    },
                },
                warehouse: {
                    columns: {
                        id: true,
                        name: true,
                        city: true,
                        country: true,
                    },
                },
                zone: {
                    columns: {
                        id: true,
                        name: true,
                    },
                },
                brand: {
                    columns: {
                        id: true,
                        name: true,
                    },
                },
                // No `family` relation post-squash. group_id + group_name + stock_mode
                // are top-level columns on each asset row.
            },
            orderBy: orderDirection,
            limit: limitNumber,
            offset: skip,
        }),

        db
            .select({
                count: count(),
            })
            .from(assets)
            .where(and(...conditions)),
    ]);

    // Get summary counts
    const [redCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(assets)
        .where(
            and(
                eq(assets.platform_id, platformId),
                eq(assets.condition, "RED"),
                isNull(assets.deleted_at)
            )
        );

    const [orangeCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(assets)
        .where(
            and(
                eq(assets.platform_id, platformId),
                eq(assets.condition, "ORANGE"),
                isNull(assets.deleted_at)
            )
        );

    // Step 6: Return paginated response
    return {
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: total[0].count,
            summary: {
                red_count: redCount.count,
                orange_count: orangeCount.count,
            },
        },
        data: result,
    };
};

// ----------------------------------- GET ASSET BY ID ------------------------------------
const getAssetById = async (id: string, user: AuthUser, platformId: string) => {
    // Step 1: Build WHERE conditions
    const conditions: any[] = [
        eq(assets.id, id),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];

    // Step 2: Filter by user role (CLIENT users can only see their company's assets)
    if (user.role === "CLIENT") {
        if (user.company_id) {
            conditions.push(eq(assets.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    // Step 3: Fetch asset with related information
    const asset = await db.query.assets.findFirst({
        where: and(...conditions),
        with: {
            company: {
                columns: {
                    id: true,
                    name: true,
                    domain: true,
                },
            },
            warehouse: {
                columns: {
                    id: true,
                    name: true,
                    city: true,
                    country: true,
                },
            },
            zone: {
                columns: {
                    id: true,
                    name: true,
                },
            },
            brand: {
                columns: {
                    id: true,
                    name: true,
                    logo_url: true,
                },
            },
            // No `family` relation post-squash. Group identity (group_id, group_name)
            // and product attributes (stock_mode, dimensions, weight_per_unit, etc.)
            // are all top-level columns on the asset row itself.
        },
    });

    // Step 4: Handle not found
    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    // Step 5: Fetch condition history from relational table
    const conditionHistory = await db
        .select({
            id: assetConditionHistory.id,
            condition: assetConditionHistory.condition,
            notes: assetConditionHistory.notes,
            photos: assetConditionHistory.photos,
            damage_report_entries: assetConditionHistory.damage_report_entries,
            updated_by: assetConditionHistory.updated_by,
            timestamp: assetConditionHistory.timestamp,
        })
        .from(assetConditionHistory)
        .where(eq(assetConditionHistory.asset_id, id))
        .orderBy(desc(assetConditionHistory.timestamp));

    const normalizedConditionHistory = conditionHistory.map((entry) => {
        const rawEntries = entry.damage_report_entries;
        const damageEntries: Array<{ url: string; description?: string }> = [];
        if (Array.isArray(rawEntries) && rawEntries.length > 0) {
            rawEntries.forEach((item) => {
                const url = (item as any)?.url;
                const description = (item as any)?.description;
                if (typeof url !== "string" || !url.trim()) return;
                damageEntries.push({
                    url: url.trim(),
                    description:
                        typeof description === "string" && description.trim().length > 0
                            ? description.trim()
                            : undefined,
                });
            });
        } else {
            (entry.photos || []).forEach((url) => {
                if (!url) return;
                damageEntries.push({ url });
            });
        }
        return {
            ...entry,
            photos: damageEntries.map((item) => item.url),
            damage_report_entries: damageEntries,
        };
    });

    const latestConditionNotes =
        normalizedConditionHistory.length > 0 ? normalizedConditionHistory[0].notes : undefined;

    // Step 6: Return asset with enhanced details
    return {
        ...asset,
        condition_history: normalizedConditionHistory,
        latest_condition_notes: latestConditionNotes,
        company_details: {
            id: asset.company.id,
            name: asset.company.name,
            domain: asset.company.domain,
        },
        warehouse_details: {
            id: asset.warehouse.id,
            name: asset.warehouse.name,
            city: asset.warehouse.city,
            country: asset.warehouse.country,
        },
        zone_details: {
            id: asset.zone.id,
            name: asset.zone.name,
        },
        brand_details: asset.brand
            ? {
                  id: asset.brand.id,
                  name: asset.brand.name,
                  logo_url: asset.brand.logo_url,
              }
            : null,
    };
};

// ----------------------------------- UPDATE ASSET ---------------------------------------
const updateAsset = async (id: string, data: any, user: AuthUser, platformId: string) => {
    try {
        // Step 1: Verify asset exists and user has access
        const conditions: any[] = [
            eq(assets.id, id),
            eq(assets.platform_id, platformId),
            isNull(assets.deleted_at),
        ];

        const [existingAsset] = await db
            .select()
            .from(assets)
            .where(and(...conditions));

        if (!existingAsset) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
        }

        // Step 2: Validate company if being updated
        if (data.company_id && existingAsset.company_id !== data.company_id) {
            const [company] = await db
                .select()
                .from(companies)
                .where(
                    and(
                        eq(companies.id, data.company_id),
                        eq(companies.platform_id, platformId),
                        isNull(companies.deleted_at)
                    )
                );

            if (!company) {
                throw new CustomizedError(httpStatus.NOT_FOUND, "Company not found or is archived");
            }
        }

        // Step 3: Validate warehouse if being updated
        if (data.warehouse_id && existingAsset.warehouse_id !== data.warehouse_id) {
            const [warehouse] = await db
                .select()
                .from(warehouses)
                .where(
                    and(
                        eq(warehouses.id, data.warehouse_id),
                        eq(warehouses.platform_id, platformId)
                    )
                );

            if (!warehouse) {
                throw new CustomizedError(httpStatus.NOT_FOUND, "Warehouse not found");
            }
        }

        // Step 4: Validate zone if being updated
        if (data.zone_id && existingAsset.zone_id !== data.zone_id) {
            const targetCompanyId = data.company_id || existingAsset.company_id;
            const targetWarehouseId = data.warehouse_id || existingAsset.warehouse_id;

            const [zone] = await db
                .select()
                .from(zones)
                .where(
                    and(
                        eq(zones.id, data.zone_id),
                        eq(zones.warehouse_id, targetWarehouseId),
                        eq(zones.company_id, targetCompanyId)
                    )
                );

            if (!zone) {
                throw new CustomizedError(
                    httpStatus.NOT_FOUND,
                    "Zone not found or does not belong to the specified warehouse and company"
                );
            }
        }

        // Step 5: Validate brand if being updated
        if (data.brand_id && existingAsset.brand_id !== data.brand_id) {
            const targetCompanyId = data.company_id || existingAsset.company_id;

            const [brand] = await db
                .select()
                .from(brands)
                .where(and(eq(brands.id, data.brand_id), eq(brands.company_id, targetCompanyId)));

            if (!brand) {
                throw new CustomizedError(
                    httpStatus.NOT_FOUND,
                    "Brand not found or does not belong to the specified company"
                );
            }
        }

        if (data.stock_mode !== undefined && data.stock_mode !== existingAsset.stock_mode) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "stock_mode is immutable after asset creation. Delete and recreate the asset if the mode is wrong."
            );
        }
        if (data.low_stock_threshold != null && existingAsset.stock_mode !== "POOLED") {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Low-stock threshold is only supported for POOLED assets"
            );
        }

        // Group move guard: if group_id is being changed (or set/cleared), validate.
        if (data.group_id !== undefined && data.group_id !== existingAsset.group_id) {
            // Block move if the asset has active bookings (same gate as before).
            if (existingAsset.group_id) {
                const activeBookings = await db
                    .select({ id: assetBookings.id })
                    .from(assetBookings)
                    .leftJoin(orders, eq(assetBookings.order_id, orders.id))
                    .where(
                        and(
                            eq(assetBookings.asset_id, id),
                            or(
                                inArray(orders.order_status, [
                                    "CONFIRMED",
                                    "IN_PREPARATION",
                                    "READY_FOR_DELIVERY",
                                    "IN_TRANSIT",
                                    "DELIVERED",
                                    "IN_USE",
                                    "AWAITING_RETURN",
                                ]),
                                sql`${assetBookings.self_pickup_id} IS NOT NULL`
                            )
                        )
                    )
                    .limit(1);

                if (activeBookings.length > 0) {
                    throw new CustomizedError(
                        httpStatus.BAD_REQUEST,
                        "Cannot move — this item has active bookings on open orders"
                    );
                }
            }

            // Joining a new group: validate sibling constraints (same company+brand+stock_mode)
            if (data.group_id) {
                const sibling = await db.query.assets.findFirst({
                    where: and(
                        eq(assets.group_id, data.group_id),
                        eq(assets.platform_id, platformId),
                        ne(assets.id, id),
                        isNull(assets.deleted_at)
                    ),
                    columns: {
                        group_name: true,
                        group_images: true,
                        group_on_display_image: true,
                    },
                });

                await validateGroupSiblingConstraints(db, {
                    groupId: data.group_id,
                    platformId,
                    companyId: data.company_id || existingAsset.company_id,
                    brandId:
                        data.brand_id === undefined
                            ? existingAsset.brand_id
                            : (data.brand_id ?? null),
                    stockMode: data.stock_mode ?? existingAsset.stock_mode,
                    excludeAssetId: id,
                });

                if (sibling) {
                    data.group_name = sibling.group_name;
                    data.group_images = Array.isArray(sibling.group_images)
                        ? sibling.group_images
                        : [];
                    data.group_on_display_image = sibling.group_on_display_image ?? null;
                } else if (!data.group_name) {
                    throw new CustomizedError(
                        httpStatus.BAD_REQUEST,
                        "group_name is required when creating a new group"
                    );
                }
            }
        }

        // Group name uniqueness: validate when setting/changing group_name OR group_id
        const effectiveGroupId =
            data.group_id !== undefined ? data.group_id : existingAsset.group_id;
        const effectiveGroupName =
            data.group_name !== undefined ? data.group_name : existingAsset.group_name;
        if (
            effectiveGroupId &&
            effectiveGroupName &&
            (data.group_id !== undefined || data.group_name !== undefined)
        ) {
            await validateGroupNameUniqueness(db, {
                platformId,
                companyId: data.company_id || existingAsset.company_id,
                groupName: effectiveGroupName,
                currentGroupId: effectiveGroupId,
            });
        }

        if (
            effectiveGroupId &&
            (data.company_id !== undefined ||
                data.brand_id !== undefined ||
                data.stock_mode !== undefined)
        ) {
            await validateGroupSiblingConstraints(db, {
                groupId: effectiveGroupId,
                platformId,
                companyId: data.company_id || existingAsset.company_id,
                brandId:
                    data.brand_id === undefined ? existingAsset.brand_id : (data.brand_id ?? null),
                stockMode: existingAsset.stock_mode,
                excludeAssetId: id,
            });
        }

        // Invariant: group_id IS NULL ⟹ group_name IS NULL (auto-clear on move-out)
        if (data.group_id === null) {
            (data as any).group_name = null;
            (data as any).group_images = [];
            (data as any).group_on_display_image = null;
        }

        const hasGroupMediaUpdate =
            data.group_images !== undefined || data.group_on_display_image !== undefined;
        const hasNonEmptyGroupMediaUpdate =
            (Array.isArray(data.group_images) && data.group_images.length > 0) ||
            (data.group_on_display_image !== undefined &&
                data.group_on_display_image !== null &&
                data.group_on_display_image !== "");

        if (hasGroupMediaUpdate && !effectiveGroupId && data.group_id !== null) {
            if (hasNonEmptyGroupMediaUpdate) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "Group media can only be edited on grouped assets"
                );
            }

            delete (data as any).group_images;
            delete (data as any).group_on_display_image;
        }

        // Step 6: Validate quantity constraints if either is being updated
        if (data.total_quantity !== undefined || data.available_quantity !== undefined) {
            const finalTotalQty =
                data.total_quantity !== undefined
                    ? data.total_quantity
                    : parseInt(existingAsset.total_quantity.toString());
            const finalAvailableQty =
                data.available_quantity !== undefined
                    ? data.available_quantity
                    : parseInt(existingAsset.available_quantity.toString());

            if (finalAvailableQty > finalTotalQty) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "Available quantity cannot exceed total quantity"
                );
            }
        }

        // Step 7: Build update data with decimal conversions
        const dbData: any = { ...data };
        if (data.weight_per_unit !== undefined) {
            dbData.weight_per_unit = data.weight_per_unit.toString();
        }
        if (data.volume_per_unit !== undefined) {
            dbData.volume_per_unit = data.volume_per_unit.toString();
        }

        // Step 8: Handle condition changes
        if (data.condition !== undefined && data.condition !== existingAsset.condition) {
            if (data.condition === "GREEN") dbData.refurb_days_estimate = null;
        }

        // Promote any draft S3 images to permanent paths — symmetric with createAsset.
        // Without this, drafts/ URLs uploaded via the inline edit flow persisted in the DB
        // and broke once the S3 lifecycle rule swept them.
        const targetCompanyId = data.company_id || existingAsset.company_id;
        if (Array.isArray(dbData.images) && dbData.images.length > 0) {
            // Reconcile against the stored row so an existing SCAN photo keeps its
            // tag even when the edit UI dropped `source`; new uploads → CLIENT.
            dbData.images = reconcileImageSources(
                await promoteDraftImages(dbData.images as AssetImageEntry[], targetCompanyId),
                existingAsset.images
            );
        }
        if (Array.isArray(dbData.group_images) && dbData.group_images.length > 0) {
            dbData.group_images = tagImagesClient(
                await promoteDraftImages(dbData.group_images as AssetImageEntry[], targetCompanyId)
            );
        }
        if (Array.isArray(dbData.condition_photos) && dbData.condition_photos.length > 0) {
            dbData.condition_photos = await Promise.all(
                dbData.condition_photos.map(async (url: string) => {
                    if (!url.includes("/drafts/")) return url;
                    const fromKey = s3KeyFromUrl(url);
                    const filename = fromKey.split("/").pop() ?? fromKey;
                    const toKey = `images/${targetCompanyId}/assets/${Date.now()}-${filename}`;
                    return moveS3Object(fromKey, toKey);
                })
            );
        }

        // Step 9: Update asset
        const groupCascadeData: Record<string, unknown> = {};
        if (dbData.group_name !== undefined) groupCascadeData.group_name = dbData.group_name;
        if (dbData.group_images !== undefined) groupCascadeData.group_images = dbData.group_images;
        if (dbData.group_on_display_image !== undefined) {
            groupCascadeData.group_on_display_image = dbData.group_on_display_image;
        }

        const [result] = await db.transaction(async (tx) => {
            const [updated] = await tx
                .update(assets)
                .set(dbData)
                .where(eq(assets.id, id))
                .returning();

            if (
                updated?.group_id &&
                Object.keys(groupCascadeData).length > 0 &&
                dbData.group_id !== null
            ) {
                await tx
                    .update(assets)
                    .set(groupCascadeData)
                    .where(
                        and(
                            eq(assets.platform_id, platformId),
                            eq(assets.group_id, updated.group_id),
                            isNull(assets.deleted_at)
                        )
                    );
            }

            return [updated];
        });

        // Step 10: Snapshot the stored post-update state for asset history
        await createAssetVersionSnapshot(id, existingAsset.platform_id, "Manual update", user.id);

        // Step 11: Insert condition history entry into table if condition changed
        if (data.condition !== undefined && data.condition !== existingAsset.condition) {
            await db.insert(assetConditionHistory).values({
                platform_id: existingAsset.platform_id,
                asset_id: id,
                condition: data.condition,
                notes: data.condition_notes || null,
                photos: [],
                updated_by: user.id,
            });
        }

        return result;
    } catch (error: any) {
        // Step 12: Handle database errors
        const pgError = error.cause || error;

        if (pgError.code === "23505") {
            if (pgError.constraint === "assets_qr_code_key") {
                throw new CustomizedError(httpStatus.CONFLICT, `Duplicate QR code found`);
            }
            throw new CustomizedError(
                httpStatus.CONFLICT,
                "An asset with these details already exists"
            );
        }

        throw error;
    }
};

const parseAssetNameSeries = (name: string): { baseName: string; suffixNumber: number | null } => {
    const trimmedName = name.trim();
    const suffixMatch = trimmedName.match(/^(.*?)(?:\s+#(\d+))?$/);

    const baseName = (suffixMatch?.[1] || trimmedName).trim() || trimmedName;
    if (!suffixMatch?.[2]) {
        return { baseName, suffixNumber: null };
    }

    const parsedSuffix = Number(suffixMatch[2]);
    return {
        baseName,
        suffixNumber: Number.isFinite(parsedSuffix) ? parsedSuffix : null,
    };
};

// ----------------------------------- ADD ASSET UNITS -----------------------------------
const addAssetUnits = async (
    id: string,
    data: AddAssetUnitsPayload,
    user: AuthUser,
    platformId: string
) => {
    const [sourceAsset] = await db
        .select()
        .from(assets)
        .where(
            and(eq(assets.id, id), eq(assets.platform_id, platformId), isNull(assets.deleted_at))
        );

    if (!sourceAsset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    if (sourceAsset.stock_mode !== "SERIALIZED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Add units is only supported for SERIALIZED assets"
        );
    }

    // Resolve group context. Two paths:
    //   - source already belongs to a group ⟶ new units inherit group_id + group_name.
    //   - source is raw ⟶ this action promotes the source into a group. We generate a
    //     fresh group_id, set group_name to the source's name, rename the source asset
    //     to "<source.name> #1", and create new siblings as "<source.name> #2..#N+1".
    //     Admin sees a confirmation in the UI before the promote-and-add (frontend
    //     concern; backend just executes).
    const { baseName } = parseAssetNameSeries(sourceAsset.name);
    let effectiveGroupId = sourceAsset.group_id;
    let effectiveGroupName = sourceAsset.group_name;
    const effectiveGroupImages = Array.isArray(sourceAsset.group_images)
        ? sourceAsset.group_images
        : [];
    const effectiveGroupOnDisplayImage = sourceAsset.group_on_display_image ?? null;
    let renameSource = false;
    let renamedSourceName = sourceAsset.name;
    if (!effectiveGroupId) {
        effectiveGroupId = randomUUID();
        effectiveGroupName = sourceAsset.name;
        renameSource = true;
        renamedSourceName = `${sourceAsset.name} #1`;
    }

    const siblingRows = await db
        .select({ name: assets.name })
        .from(assets)
        .where(
            and(
                eq(assets.platform_id, platformId),
                eq(assets.company_id, sourceAsset.company_id),
                isNull(assets.deleted_at),
                ilike(assets.name, `${baseName}%`)
            )
        );

    let maxSuffixNumber = renameSource ? 1 : 1;
    for (const row of siblingRows) {
        const parsed = parseAssetNameSeries(row.name);
        if (parsed.baseName !== baseName) continue;
        const normalizedSuffix = parsed.suffixNumber ?? 1;
        if (normalizedSuffix > maxSuffixNumber) {
            maxSuffixNumber = normalizedSuffix;
        }
    }

    const createdAssets = await db.transaction(async (tx) => {
        const created: Array<{ id: string; name: string; qr_code: string }> = [];

        // Promote source asset into the group (raw → grouped) if we generated a new group_id
        if (renameSource) {
            await tx
                .update(assets)
                .set({
                    group_id: effectiveGroupId,
                    group_name: effectiveGroupName,
                    group_images: effectiveGroupImages,
                    group_on_display_image: effectiveGroupOnDisplayImage,
                    name: renamedSourceName,
                })
                .where(eq(assets.id, sourceAsset.id));
        }

        for (let index = 0; index < data.quantity; index += 1) {
            const qrCode = await qrCodeGenerator(sourceAsset.company_id);
            const unitName = `${baseName} #${maxSuffixNumber + index + 1}`;

            const [createdAsset] = await tx
                .insert(assets)
                .values({
                    platform_id: sourceAsset.platform_id,
                    company_id: sourceAsset.company_id,
                    warehouse_id: sourceAsset.warehouse_id,
                    zone_id: sourceAsset.zone_id,
                    brand_id: sourceAsset.brand_id,
                    group_id: effectiveGroupId,
                    group_name: effectiveGroupName,
                    group_images: effectiveGroupImages,
                    group_on_display_image: effectiveGroupOnDisplayImage,
                    team_id: sourceAsset.team_id,
                    name: unitName,
                    description: sourceAsset.description,
                    category: sourceAsset.category,
                    images: sourceAsset.images || [],
                    on_display_image: sourceAsset.on_display_image,
                    stock_mode: "SERIALIZED",
                    total_quantity: 1,
                    available_quantity: 1,
                    qr_code: qrCode,
                    packaging: sourceAsset.packaging,
                    weight_per_unit: sourceAsset.weight_per_unit,
                    dimensions: sourceAsset.dimensions || {},
                    volume_per_unit: sourceAsset.volume_per_unit,
                    condition: sourceAsset.condition,
                    condition_notes: sourceAsset.condition_notes,
                    refurb_days_estimate: sourceAsset.refurb_days_estimate,
                    handling_tags: sourceAsset.handling_tags || [],
                    status: "AVAILABLE",
                    low_stock_threshold: sourceAsset.low_stock_threshold ?? null,
                })
                .returning({
                    id: assets.id,
                    name: assets.name,
                    qr_code: assets.qr_code,
                });

            created.push(createdAsset);
        }

        return created;
    });

    for (const createdAsset of createdAssets) {
        await createAssetVersionSnapshot(createdAsset.id, platformId, "Added units", user.id);
    }

    return {
        source_asset_id: sourceAsset.id,
        created_count: createdAssets.length,
        created_assets: createdAssets,
    };
};

// ----------------------------------- DELETE ASSET ---------------------------------------
const deleteAsset = async (id: string, user: AuthUser, platformId: string) => {
    // Step 1: Verify asset exists
    const conditions: any[] = [
        eq(assets.id, id),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];

    const [existingAsset] = await db
        .select()
        .from(assets)
        .where(and(...conditions));

    if (!existingAsset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    // Step 2: Check if asset is referenced by any order items
    // const [orderItemReference] = await db
    //     .select()
    //     .from(orderItems)
    //     .where(eq(orderItems.asset_id, id))
    //     .limit(1);

    // if (orderItemReference) {
    //     throw new CustomizedError(
    //         httpStatus.CONFLICT,
    //         "Cannot delete asset because it is referenced by existing orders. You can deactivate it by setting status to MAINTENANCE instead."
    //     );
    // }

    // Step 3: Check if asset is currently booked
    const bookings = await db.query.assetBookings.findFirst({
        where: eq(assets.id, id),
    });

    if (bookings) {
        throw new CustomizedError(
            httpStatus.CONFLICT,
            "Cannot delete asset that has active bookings"
        );
    }

    // Step 4: Soft delete asset (set deleted_at timestamp)
    await db
        .update(assets)
        .set({
            deleted_at: new Date(),
        })
        .where(eq(assets.id, id));

    return null;
};

// ----------------------------------- GET ASSET AVAILABILITY STATS -----------------------
const getAssetAvailabilityStats = async (id: string, user: AuthUser, platformId: string) => {
    // Step 1: Get asset with access control
    const conditions: any[] = [
        eq(assets.id, id),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];

    // CLIENT users can only see their company's assets
    if (user.role === "CLIENT") {
        if (user.company_id) {
            conditions.push(eq(assets.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    const asset = await db.query.assets.findFirst({
        where: and(...conditions),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    const totalQuantity = asset.total_quantity;

    // Step 2: Calculate BOOKED quantity from active bookings. `asset_bookings`
    // is polymorphic (gotcha #36) — we must union ORDER-linked rows AND
    // SELF_PICKUP-linked rows, filtering each by their parent's active statuses.
    // Uses AvailabilityCore.ACTIVE_PARENT_STATUSES_FOR_BOOKINGS so this counter stays consistent
    // with the family stats counter and the self-bookings availability gate.
    // The list now includes tentative pre-confirmation statuses (SUBMITTED..
    // QUOTED) so admin/warehouse "Booked" reflects reality the moment a client
    // submits — see plan file's "Booked includes tentative" UX choice.
    const activeOrderBookings = await db
        .select({ quantity: assetBookings.quantity })
        .from(assetBookings)
        .innerJoin(orders, eq(assetBookings.order_id, orders.id))
        .where(
            and(
                eq(assetBookings.asset_id, id),
                inArray(
                    orders.order_status,
                    AvailabilityCore.ACTIVE_PARENT_STATUSES_FOR_BOOKINGS.ORDER
                )
            )
        );

    const activeSelfPickupBookings = await db
        .select({ quantity: assetBookings.quantity })
        .from(assetBookings)
        .innerJoin(selfPickups, eq(assetBookings.self_pickup_id, selfPickups.id))
        .where(
            and(
                eq(assetBookings.asset_id, id),
                inArray(
                    selfPickups.self_pickup_status,
                    AvailabilityCore.ACTIVE_PARENT_STATUSES_FOR_BOOKINGS.SELF_PICKUP
                )
            )
        );

    const bookedQuantity =
        activeOrderBookings.reduce((sum, booking) => sum + booking.quantity, 0) +
        activeSelfPickupBookings.reduce((sum, booking) => sum + booking.quantity, 0);

    // Step 3: Calculate OUT quantity from scan events
    const outboundScans = await db
        .select({
            quantity: scanEvents.quantity,
        })
        .from(scanEvents)
        .where(and(eq(scanEvents.asset_id, id), eq(scanEvents.scan_type, "OUTBOUND")));

    const inboundScans = await db
        .select({
            quantity: scanEvents.quantity,
        })
        .from(scanEvents)
        .where(and(eq(scanEvents.asset_id, id), eq(scanEvents.scan_type, "INBOUND")));

    const totalOutbound = outboundScans.reduce((sum, scan) => sum + scan.quantity, 0);
    const totalInbound = inboundScans.reduce((sum, scan) => sum + scan.quantity, 0);
    const outQuantity = Math.max(0, totalOutbound - totalInbound);

    // Step 4: Calculate IN_MAINTENANCE quantity
    let inMaintenanceQuantity = 0;
    if (asset.condition === "RED") {
        inMaintenanceQuantity = totalQuantity;
    }

    // Step 5: Calculate self-booked quantity (single aggregate query)
    const [selfBookedRow] = await db
        .select({
            total: sql<number>`COALESCE(SUM(${selfBookingItems.quantity} - ${selfBookingItems.returned_quantity}), 0)`,
        })
        .from(selfBookingItems)
        .where(and(eq(selfBookingItems.asset_id, id), eq(selfBookingItems.status, "OUT")));

    const selfBookedQuantity = Number(selfBookedRow?.total ?? 0);

    // Step 6: Calculate AVAILABLE quantity
    const availableQuantity = Math.max(
        0,
        totalQuantity - bookedQuantity - outQuantity - inMaintenanceQuantity - selfBookedQuantity
    );

    return {
        asset_id: id,
        total_quantity: totalQuantity,
        available_quantity: availableQuantity,
        booked_quantity: bookedQuantity,
        out_quantity: outQuantity,
        in_maintenance_quantity: inMaintenanceQuantity,
        self_booked_quantity: selfBookedQuantity,
        breakdown: {
            active_bookings_count: activeOrderBookings.length + activeSelfPickupBookings.length,
            outbound_scans_total: totalOutbound,
            inbound_scans_total: totalInbound,
        },
    };
};

// ----------------------------------- GET ASSET SCAN HISTORY -----------------------------
const getAssetScanHistory = async (id: string, user: AuthUser, platformId: string) => {
    // Step 1: Verify asset exists and user has access
    const conditions: any[] = [
        eq(assets.id, id),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];

    // CLIENT users can only see their company's assets
    if (user.role === "CLIENT") {
        if (user.company_id) {
            conditions.push(eq(assets.company_id, user.company_id));
        } else {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
    }

    const asset = await db.query.assets.findFirst({
        where: and(...conditions),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    // Step 2: Get scan history for the asset
    const events = await db.query.scanEvents.findMany({
        where: eq(scanEvents.asset_id, id),
        with: {
            asset: {
                columns: {
                    id: true,
                    name: true,
                    qr_code: true,
                    stock_mode: true,
                },
            },
            scanned_by_user: {
                columns: {
                    id: true,
                    name: true,
                },
            },
            order: {
                columns: {
                    id: true,
                    order_id: true,
                },
            },
        },
        orderBy: (scanEvents, { desc }) => [desc(scanEvents.scanned_at)],
    });

    // Step 3: Return scan history
    return {
        asset_id: id,
        asset_name: asset.name,
        qr_code: asset.qr_code,
        scan_history: events,
    };
};

// ----------------------------------- GET AVAILABILITY (unified) -------------------------
// Single endpoint replacing the old batch-availability + check-availability pair.
// All availability gating across the platform delegates to availability.core.ts;
// this is just the HTTP-facing wrapper.
const getAvailability = async (
    data: {
        items: Array<{ asset_id: string; quantity?: number }>;
        window?: { start: string; end: string };
        exclude_entity?: { type: "ORDER" | "SELF_PICKUP"; id: string };
    },
    user: AuthUser,
    platformId: string
) => {
    // CLIENT users are scoped to their own company's assets.
    let companyId: string | null = null;
    if (user.role === "CLIENT") {
        if (!user.company_id) {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
        companyId = user.company_id;
    }

    const window = data.window
        ? { start: new Date(data.window.start), end: new Date(data.window.end) }
        : undefined;

    const results = await AvailabilityCore.checkAvailability({
        platformId,
        companyId,
        requests: data.items,
        window,
        excludeEntity: data.exclude_entity,
    });

    return {
        items: Array.from(results.values()),
    };
};

// ----------------------------------- ADD CONDITION HISTORY ------------------------------
const addConditionHistory = async (
    data: AddConditionHistoryPayload,
    user: AuthUser,
    platformId: string
) => {
    // Step 1: Fetch asset (verify exists, platform scope, not deleted)
    const asset = await db.query.assets.findFirst({
        where: and(
            eq(assets.id, data.asset_id),
            eq(assets.platform_id, platformId),
            isNull(assets.deleted_at)
        ),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    // Validate notes requirement
    if (
        data.condition &&
        (data.condition === "ORANGE" || data.condition === "RED") &&
        !data.notes
    ) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Notes are required when marking items as Orange or Red"
        );
    }

    const normalizedDamageEntries = new Map<string, string | undefined>();
    (data.damage_report_entries || []).forEach((entry) => {
        const url = entry.url?.trim();
        if (!url) return;
        const description = entry.description?.trim();
        normalizedDamageEntries.set(
            url,
            description && description.length > 0 ? description : undefined
        );
    });
    (data.photos || []).forEach((photoUrl) => {
        const url = photoUrl?.trim();
        if (!url || normalizedDamageEntries.has(url)) return;
        normalizedDamageEntries.set(url, undefined);
    });
    const damageEntries = Array.from(normalizedDamageEntries.entries()).map(
        ([url, description]) => ({
            url,
            description,
        })
    );
    const damagePhotoUrls = damageEntries.map((entry) => entry.url);

    // Validate photos requirement
    if (data.condition && data.condition === "RED" && damagePhotoUrls.length === 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "At least one damage photo is required when marking items as Red"
        );
    }

    // Step 2: Prepare asset update
    const newCondition = data.condition || asset.condition;
    const updatedData: any = { condition: newCondition };

    if (data.condition === "GREEN") updatedData.refurb_days_estimate = null;
    else if (data.refurb_days_estimate)
        updatedData.refurb_days_estimate = data.refurb_days_estimate;

    // Step 3: Update asset condition
    await db.update(assets).set(updatedData).where(eq(assets.id, data.asset_id));

    // Step 4: Insert condition history entry into relational table
    await db.insert(assetConditionHistory).values({
        platform_id: platformId,
        asset_id: data.asset_id,
        condition: newCondition,
        notes: data.notes || "",
        photos: damagePhotoUrls,
        damage_report_entries: damageEntries,
        updated_by: user.id,
    });

    // Step 5: Return updated asset
    const [result] = await db
        .select({ id: assets.id, name: assets.name, condition: assets.condition })
        .from(assets)
        .where(eq(assets.id, data.asset_id));

    return result;
};

const updateAssetCondition = async (
    assetId: string,
    data: UpdateAssetConditionPayload,
    user: AuthUser,
    platformId: string
) => {
    const asset = await db.query.assets.findFirst({
        where: and(
            eq(assets.id, assetId),
            eq(assets.platform_id, platformId),
            isNull(assets.deleted_at)
        ),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    if (asset.status === "TRANSFORMED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Condition cannot be updated on transformed assets"
        );
    }

    if (asset.condition === data.condition) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Condition is unchanged. Add an observation instead."
        );
    }

    const damageEntries = data.photo_entries.map((entry) => ({
        url: entry.url.trim(),
        description:
            entry.description && entry.description.trim().length > 0
                ? entry.description.trim()
                : undefined,
    }));
    const photoUrls = damageEntries.map((entry) => entry.url);
    const notes = data.notes.trim();

    const updateData: {
        condition: "GREEN" | "ORANGE" | "RED";
        condition_notes: string | null;
        refurb_days_estimate: number | null;
        updated_at: Date;
    } = {
        condition: data.condition,
        condition_notes: data.condition === "GREEN" ? null : notes,
        refurb_days_estimate:
            data.condition === "GREEN" ? null : (data.refurb_days_estimate ?? null),
        updated_at: new Date(),
    };

    const [updated, historyEntry] = await db.transaction(async (tx) => {
        const [updatedAsset] = await tx
            .update(assets)
            .set(updateData)
            .where(and(eq(assets.id, assetId), eq(assets.platform_id, platformId)))
            .returning({
                id: assets.id,
                name: assets.name,
                condition: assets.condition,
                condition_notes: assets.condition_notes,
                refurb_days_estimate: assets.refurb_days_estimate,
                status: assets.status,
                updated_at: assets.updated_at,
            });

        const [insertedHistory] = await tx
            .insert(assetConditionHistory)
            .values({
                platform_id: platformId,
                asset_id: assetId,
                condition: data.condition,
                notes,
                photos: photoUrls,
                damage_report_entries: damageEntries,
                updated_by: user.id,
            })
            .returning({
                id: assetConditionHistory.id,
                condition: assetConditionHistory.condition,
                notes: assetConditionHistory.notes,
                photos: assetConditionHistory.photos,
                damage_report_entries: assetConditionHistory.damage_report_entries,
                updated_by: assetConditionHistory.updated_by,
                timestamp: assetConditionHistory.timestamp,
            });

        return [updatedAsset, insertedHistory];
    });

    return {
        asset: updated,
        condition_history: historyEntry,
    };
};

// ----------------------------------- GENERATE QR CODE -----------------------------------
const generateQRCode = async (data: GenerateQRCodePayload) => {
    // Generate QR code as base64 PNG
    const qrCodeImage = await QRCode.toDataURL(data.qr_code, {
        errorCorrectionLevel: "H",
        type: "image/png",
        width: 300,
        margin: 2,
    });

    return {
        qr_code_image: qrCodeImage,
    };
};

// ----------------------------------- COMPLETE MAINTENANCE -------------------------------
// const completeMaintenance = async (
//     data: CompleteMaintenancePayload,
//     user: AuthUser,
//     platformId: string
// ) => {
//     // Step 1: Fetch asset to verify it exists and is in RED condition
//     const asset = await db.query.assets.findFirst({
//         where: and(
//             eq(assets.id, data.asset_id),
//             eq(assets.platform_id, platformId),
//             isNull(assets.deleted_at)
//         ),
//     });

//     if (!asset) {
//         throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
//     }

//     // Step 2: Validate asset is in RED condition
//     if (asset.condition !== "RED") {
//         throw new CustomizedError(
//             httpStatus.BAD_REQUEST,
//             "Only RED condition assets can have maintenance completed"
//         );
//     }

//     // Step 3: Get existing history or initialize empty array
//     const existingHistory = Array.isArray(asset.condition_history) ? asset.condition_history : [];

//     // Step 4: Create new history entry for maintenance completion
//     const newHistory = {
//         condition: "GREEN" as const,
//         notes: data.maintenance_notes,
//         photos: [],
//         updated_by: user.id,
//         timestamp: new Date().toISOString(),
//     };

//     // Step 5: Prepend new entry (newest first)
//     const condition_history = [newHistory, ...existingHistory];

//     // Step 6: Update asset - set to GREEN and AVAILABLE
//     const [result] = await db
//         .update(assets)
//         .set({
//             condition: "GREEN",
//             status: "AVAILABLE",
//             condition_history,
//         })
//         .where(eq(assets.id, data.asset_id))
//         .returning({
//             id: assets.id,
//             name: assets.name,
//             condition: assets.condition,
//             status: assets.status,
//             condition_history: assets.condition_history,
//             updated_at: assets.updated_at,
//         });

//     return result;
// };

const sentAssetToMaintenance = async (assetId: string, platformId: string) => {
    // Step 1: Fetch order and verify status
    const asset = await db.query.assets.findFirst({
        where: and(eq(assets.id, assetId), eq(assets.platform_id, platformId)),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    if (asset.status === "MAINTENANCE") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Asset is already in maintenance");
    }

    if (asset.status !== "BOOKED") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Asset is not in booked status");
    }

    await db.transaction(async (tx) => {
        await tx
            .update(assets)
            .set({
                status: "MAINTENANCE",
                updated_at: new Date(),
            })
            .where(and(eq(assets.id, assetId), eq(assets.platform_id, platformId)));
    });

    return {
        asset_id: assetId,
        status: "MAINTENANCE",
    };
};

const completeAssetMaintenance = async (assetId: string, platformId: string, user: AuthUser) => {
    const asset = await db.query.assets.findFirst({
        where: and(eq(assets.id, assetId), eq(assets.platform_id, platformId)),
    });

    if (!asset) throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    if (asset.status !== "MAINTENANCE")
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Asset is not in maintenance status");

    await db.transaction(async (tx) => {
        await tx
            .update(assets)
            .set({
                status: "BOOKED",
                condition: "GREEN",
                refurb_days_estimate: null,
                condition_notes: null,
                updated_at: new Date(),
            })
            .where(and(eq(assets.id, assetId), eq(assets.platform_id, platformId)));

        // Audit trail: record the GREEN transition
        await tx.insert(assetConditionHistory).values({
            platform_id: platformId,
            asset_id: assetId,
            condition: "GREEN",
            notes: "Maintenance completed — asset restored to service",
            photos: [],
            updated_by: user.id,
        });
    });

    // Version snapshot after maintenance
    await createAssetVersionSnapshot(assetId, platformId, "Maintenance completed", user.id);

    return { asset_id: assetId, status: "BOOKED" };
};

// ----------------------------------- ASSET VERSION SNAPSHOT --------------------------------
const createAssetVersionSnapshot = async (
    assetId: string,
    platformId: string,
    reason: string,
    userId: string,
    orderId?: string
) => {
    const asset = await db.query.assets.findFirst({
        where: and(eq(assets.id, assetId), eq(assets.platform_id, platformId)),
        with: {
            brand: { columns: { id: true, name: true } },
            warehouse: { columns: { id: true, name: true } },
            zone: { columns: { id: true, name: true } },
        },
    });
    if (!asset) return null;

    // Count existing versions
    const [countResult] = await db
        .select({ count: count() })
        .from(assetVersions)
        .where(eq(assetVersions.asset_id, assetId));
    const versionNumber = (countResult?.count || 0) + 1;

    const snapshot = {
        name: asset.name,
        group_id: asset.group_id,
        group_name: asset.group_name,
        stock_mode: asset.stock_mode,
        low_stock_threshold: asset.low_stock_threshold,
        brand_id: asset.brand_id,
        brand_name: asset.brand?.name || null,
        category: asset.category,
        images: asset.images,
        on_display_image: asset.on_display_image,
        condition: asset.condition,
        condition_notes: asset.condition_notes,
        weight_per_unit: asset.weight_per_unit,
        dimensions: asset.dimensions,
        volume_per_unit: asset.volume_per_unit,
        warehouse_id: asset.warehouse_id,
        warehouse_name: asset.warehouse?.name || null,
        zone_id: asset.zone_id,
        zone_name: asset.zone?.name || null,
        total_quantity: asset.total_quantity,
        available_quantity: asset.available_quantity,
        handling_tags: asset.handling_tags,
        status: asset.status,
    };

    const [version] = await db
        .insert(assetVersions)
        .values({
            platform_id: platformId,
            asset_id: assetId,
            version_number: versionNumber,
            reason,
            order_id: orderId || null,
            snapshot,
            created_by: userId,
        })
        .returning();

    return version;
};

// ----------------------------------- GET ASSET VERSIONS ------------------------------------
const getAssetVersions = async (assetId: string, platformId: string) => {
    const versions = await db
        .select({
            id: assetVersions.id,
            version_number: assetVersions.version_number,
            reason: assetVersions.reason,
            order_id: assetVersions.order_id,
            snapshot: assetVersions.snapshot,
            created_by: assetVersions.created_by,
            created_at: assetVersions.created_at,
        })
        .from(assetVersions)
        .where(and(eq(assetVersions.asset_id, assetId), eq(assetVersions.platform_id, platformId)))
        .orderBy(desc(assetVersions.version_number));

    return versions;
};

// ----------------------------------- GET ASSET ORDER HISTORY -----------------------------------
const getAssetOrderHistory = async (assetId: string, platformId: string) => {
    // Get all bookings for this asset. asset_bookings.order_id is now nullable because
    // bookings are polymorphic (order_id XOR self_pickup_id) — but the inner join to orders
    // below guarantees we only see order-linked bookings here, so runtime values are
    // non-null. We narrow the type explicitly after the query for TypeScript.
    const rawBookings = await db
        .select({
            order_id: assetBookings.order_id,
            blocked_from: assetBookings.blocked_from,
            blocked_until: assetBookings.blocked_until,
        })
        .from(assetBookings)
        .innerJoin(orders, eq(assetBookings.order_id, orders.id))
        .where(and(eq(assetBookings.asset_id, assetId), eq(orders.platform_id, platformId)))
        .orderBy(desc(assetBookings.blocked_from));

    const bookings = rawBookings.filter(
        (b): b is typeof b & { order_id: string } => b.order_id !== null
    );

    if (bookings.length === 0) return [];

    const orderIds = [...new Set(bookings.map((b) => b.order_id))];

    // Fetch order details
    const orderDetails = await db
        .select({
            id: orders.id,
            order_id: orders.order_id,
            order_status: orders.order_status,
            event_start_date: orders.event_start_date,
            event_end_date: orders.event_end_date,
            company_name: companies.name,
        })
        .from(orders)
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .where(inArray(orders.id, orderIds));

    // Fetch canonical scan events linked to this asset directly or via scan_event_assets.
    // scan_events.order_id is now nullable (polymorphic with self_pickup_id); the inArray
    // filter below restricts to order-linked scans, so runtime order_id is non-null.
    const rawScans = await db
        .select({
            id: scanEvents.id,
            order_id: scanEvents.order_id,
            scan_type: scanEvents.scan_type,
            condition: scanEvents.condition,
            notes: scanEvents.notes,
            scanned_at: scanEvents.scanned_at,
            scanned_by_name: users.name,
        })
        .from(scanEvents)
        .leftJoin(users, eq(scanEvents.scanned_by, users.id))
        .where(
            and(
                inArray(scanEvents.order_id, orderIds),
                sql<boolean>`
                    ${scanEvents.asset_id} = ${assetId}
                    OR EXISTS (
                        SELECT 1
                        FROM ${scanEventAssets} sea
                        WHERE sea.scan_event_id = ${scanEvents.id}
                          AND sea.asset_id = ${assetId}
                    )
                `
            )
        )
        .orderBy(desc(scanEvents.scanned_at));

    const scans = rawScans.filter((s): s is typeof s & { order_id: string } => s.order_id !== null);

    const scanEventIds = [...new Set(scans.map((scan) => scan.id))];
    const mediaRows =
        scanEventIds.length > 0
            ? await db
                  .select({
                      scan_event_id: scanEventMedia.scan_event_id,
                      url: scanEventMedia.url,
                      note: scanEventMedia.note,
                      media_kind: scanEventMedia.media_kind,
                      sort_order: scanEventMedia.sort_order,
                  })
                  .from(scanEventMedia)
                  .where(inArray(scanEventMedia.scan_event_id, scanEventIds))
                  .orderBy(asc(scanEventMedia.sort_order))
            : [];

    const mediaByEventId = new Map<string, typeof mediaRows>();
    mediaRows.forEach((row) => {
        if (!mediaByEventId.has(row.scan_event_id)) mediaByEventId.set(row.scan_event_id, []);
        mediaByEventId.get(row.scan_event_id)!.push(row);
    });

    const scansByOrder = new Map<string, typeof scans>();
    for (const scan of scans) {
        if (!scansByOrder.has(scan.order_id)) scansByOrder.set(scan.order_id, []);
        scansByOrder.get(scan.order_id)!.push(scan);
    }

    return bookings.map((booking) => {
        const order = orderDetails.find((o) => o.id === booking.order_id);
        const orderScans = scansByOrder.get(booking.order_id) ?? [];
        const outbound = orderScans.find((s) => s.scan_type === "OUTBOUND");
        const inbound = orderScans.find((s) => s.scan_type === "INBOUND");
        const derig = orderScans.find((s) => s.scan_type === "DERIG_CAPTURE");

        const inboundMedia = inbound ? (mediaByEventId.get(inbound.id) ?? []) : [];
        const derigMedia = derig ? (mediaByEventId.get(derig.id) ?? []) : [];

        const inboundDamagePhotos = inboundMedia
            .filter((media) => media.media_kind === "DAMAGE")
            .map((media) => media.url);

        const derigPhotos = derigMedia
            .filter((media) => media.media_kind === "DERIG")
            .map((media) => media.url);

        return {
            order_id: booking.order_id,
            order_readable_id: order?.order_id ?? "",
            order_status: order?.order_status ?? "",
            company_name: order?.company_name ?? "",
            event_start: order?.event_start_date,
            event_end: order?.event_end_date,
            outbound_scan: outbound
                ? { scanned_at: outbound.scanned_at, scanned_by_name: outbound.scanned_by_name }
                : null,
            derig_capture:
                derig && derigPhotos.length > 0
                    ? { photos: derigPhotos, notes: derig.notes }
                    : null,
            inbound_scan: inbound
                ? {
                      scanned_at: inbound.scanned_at,
                      condition: inbound.condition,
                      photos: inboundDamagePhotos,
                  }
                : null,
        };
    });
};

// ----------------------------------- GET ASSET USAGE REPORT -----------------------------------
const getAssetUsageReport = async (assetId: string, user: AuthUser, platformId: string) => {
    const assetConditions: any[] = [
        eq(assets.id, assetId),
        eq(assets.platform_id, platformId),
        isNull(assets.deleted_at),
    ];

    if (user.role === "CLIENT") {
        if (!user.company_id) {
            throw new CustomizedError(httpStatus.UNAUTHORIZED, "Company not found");
        }
        assetConditions.push(eq(assets.company_id, user.company_id));
    }

    const [asset] = await db
        .select({
            id: assets.id,
            name: assets.name,
            company_id: assets.company_id,
            company_name: companies.name,
            condition: assets.condition,
            status: assets.status,
            available_quantity: assets.available_quantity,
            total_quantity: assets.total_quantity,
            last_scanned_at: assets.last_scanned_at,
            condition_notes: assets.condition_notes,
            refurb_days_estimate: assets.refurb_days_estimate,
        })
        .from(assets)
        .leftJoin(companies, eq(assets.company_id, companies.id))
        .where(and(...assetConditions))
        .limit(1);

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }

    const [orderUsages, scanRows, conditionRows, linkedServiceRequests] = await Promise.all([
        db
            .select({
                booking_id: assetBookings.id,
                order_id: orders.id,
                order_readable_id: orders.order_id,
                order_status: orders.order_status,
                company_name: companies.name,
                blocked_from: assetBookings.blocked_from,
                blocked_until: assetBookings.blocked_until,
                event_start_date: orders.event_start_date,
                event_end_date: orders.event_end_date,
                quantity: assetBookings.quantity,
            })
            .from(assetBookings)
            .innerJoin(orders, eq(assetBookings.order_id, orders.id))
            .leftJoin(companies, eq(orders.company_id, companies.id))
            .where(and(eq(assetBookings.asset_id, assetId), eq(orders.platform_id, platformId)))
            .orderBy(desc(assetBookings.blocked_from)),
        db
            .select({
                id: scanEvents.id,
                order_id: scanEvents.order_id,
                order_readable_id: orders.order_id,
                scan_type: scanEvents.scan_type,
                condition: scanEvents.condition,
                notes: scanEvents.notes,
                quantity: scanEvents.quantity,
                scanned_at: scanEvents.scanned_at,
                scanned_by_name: users.name,
            })
            .from(scanEvents)
            .innerJoin(orders, eq(scanEvents.order_id, orders.id))
            .leftJoin(users, eq(scanEvents.scanned_by, users.id))
            .where(
                and(
                    eq(orders.platform_id, platformId),
                    sql<boolean>`
                        ${scanEvents.asset_id} = ${assetId}
                        OR EXISTS (
                            SELECT 1
                            FROM ${scanEventAssets} sea
                            WHERE sea.scan_event_id = ${scanEvents.id}
                              AND sea.asset_id = ${assetId}
                        )
                    `
                )
            )
            .orderBy(desc(scanEvents.scanned_at)),
        db
            .select({
                id: assetConditionHistory.id,
                condition: assetConditionHistory.condition,
                notes: assetConditionHistory.notes,
                photos: assetConditionHistory.photos,
                damage_report_entries: assetConditionHistory.damage_report_entries,
                timestamp: assetConditionHistory.timestamp,
                updated_by_name: users.name,
            })
            .from(assetConditionHistory)
            .leftJoin(users, eq(assetConditionHistory.updated_by, users.id))
            .where(
                and(
                    eq(assetConditionHistory.asset_id, assetId),
                    eq(assetConditionHistory.platform_id, platformId)
                )
            )
            .orderBy(desc(assetConditionHistory.timestamp)),
        db
            .select({
                id: serviceRequests.id,
                service_request_id: serviceRequests.service_request_id,
                request_type: serviceRequests.request_type,
                request_status: serviceRequests.request_status,
                commercial_status: serviceRequests.commercial_status,
                title: serviceRequests.title,
                description: serviceRequests.description,
                work_notes: serviceRequests.work_notes,
                photos: serviceRequests.photos,
                created_at: serviceRequests.created_at,
                completed_at: serviceRequests.completed_at,
                related_order_id: serviceRequests.related_order_id,
                related_order_readable_id: orders.order_id,
            })
            .from(serviceRequests)
            .leftJoin(orders, eq(serviceRequests.related_order_id, orders.id))
            .where(
                and(
                    eq(serviceRequests.related_asset_id, assetId),
                    eq(serviceRequests.platform_id, platformId)
                )
            )
            .orderBy(desc(serviceRequests.created_at)),
    ]);

    const scanEventIds = [...new Set(scanRows.map((scan) => scan.id))];
    const scanMediaRows =
        scanEventIds.length > 0
            ? await db
                  .select({
                      scan_event_id: scanEventMedia.scan_event_id,
                      url: scanEventMedia.url,
                      note: scanEventMedia.note,
                      media_kind: scanEventMedia.media_kind,
                      sort_order: scanEventMedia.sort_order,
                  })
                  .from(scanEventMedia)
                  .where(inArray(scanEventMedia.scan_event_id, scanEventIds))
                  .orderBy(asc(scanEventMedia.sort_order))
            : [];

    const mediaByEventId = new Map<string, typeof scanMediaRows>();
    scanMediaRows.forEach((row) => {
        if (!mediaByEventId.has(row.scan_event_id)) mediaByEventId.set(row.scan_event_id, []);
        mediaByEventId.get(row.scan_event_id)!.push(row);
    });

    const timeline: Array<{
        id: string;
        event_type: "ORDER_USAGE" | "SCAN_EVENT" | "SERVICE_REQUEST" | "CONDITION_UPDATE";
        occurred_at: Date;
        title: string;
        subtitle?: string | null;
        note?: string | null;
        actor_name?: string | null;
        condition?: string | null;
        scan_type?: string | null;
        order_id?: string | null;
        order_readable_id?: string | null;
        service_request_id?: string | null;
        photos: Array<{ url: string; note?: string | null; kind?: string | null }>;
    }> = [];

    orderUsages.forEach((usage) => {
        timeline.push({
            id: `order-usage-${usage.booking_id}`,
            event_type: "ORDER_USAGE",
            occurred_at: usage.blocked_from,
            title: `Used in order ${usage.order_readable_id}`,
            subtitle: `Quantity ${usage.quantity} • ${usage.order_status}`,
            note: usage.company_name
                ? `Client: ${usage.company_name}. Window: ${usage.blocked_from.toISOString()} -> ${usage.blocked_until.toISOString()}`
                : `Window: ${usage.blocked_from.toISOString()} -> ${usage.blocked_until.toISOString()}`,
            order_id: usage.order_id,
            order_readable_id: usage.order_readable_id,
            photos: [],
        });
    });

    scanRows.forEach((event) => {
        const media = (mediaByEventId.get(event.id) || []).map((item) => ({
            url: item.url,
            note: item.note || null,
            kind: item.media_kind || null,
        }));
        timeline.push({
            id: `scan-${event.id}`,
            event_type: "SCAN_EVENT",
            occurred_at: event.scanned_at,
            title: `${event.scan_type.replace(/_/g, " ")} recorded`,
            subtitle: event.order_readable_id ? `Order ${event.order_readable_id}` : undefined,
            note: event.notes || null,
            actor_name: event.scanned_by_name || null,
            condition: event.condition || null,
            scan_type: event.scan_type,
            order_id: event.order_id,
            order_readable_id: event.order_readable_id,
            photos: media,
        });
    });

    conditionRows.forEach((entry) => {
        const rawDamageEntries = Array.isArray(entry.damage_report_entries)
            ? entry.damage_report_entries
            : [];
        const damagePhotos = rawDamageEntries
            .map((item) => {
                const url = (item as any)?.url;
                if (typeof url !== "string" || !url.trim()) return null;
                return {
                    url: url.trim(),
                    note:
                        typeof (item as any)?.description === "string" &&
                        (item as any).description.trim().length > 0
                            ? (item as any).description.trim()
                            : null,
                    kind: "DAMAGE",
                };
            })
            .filter(Boolean) as Array<{ url: string; note?: string | null; kind?: string | null }>;

        const fallbackPhotos =
            damagePhotos.length > 0
                ? []
                : (entry.photos || []).map((url) => ({ url, kind: "GENERAL" as const }));

        timeline.push({
            id: `condition-${entry.id}`,
            event_type: "CONDITION_UPDATE",
            occurred_at: entry.timestamp,
            title: `Condition set to ${entry.condition}`,
            note: entry.notes || null,
            actor_name: entry.updated_by_name || null,
            condition: entry.condition,
            photos: damagePhotos.length > 0 ? damagePhotos : fallbackPhotos,
        });
    });

    linkedServiceRequests.forEach((request) => {
        const photos = (request.photos || []).map((url) => ({
            url,
            note: request.work_notes || null,
            kind: "SERVICE_REQUEST",
        }));
        timeline.push({
            id: `service-request-${request.id}`,
            event_type: "SERVICE_REQUEST",
            occurred_at: request.completed_at || request.created_at,
            title: `${request.request_type} service request ${request.service_request_id}`,
            subtitle: `${request.request_status} • ${request.commercial_status}`,
            note: request.work_notes || request.description || null,
            service_request_id: request.service_request_id,
            order_id: request.related_order_id,
            order_readable_id: request.related_order_readable_id,
            photos,
        });
    });

    timeline.sort((a, b) => b.occurred_at.getTime() - a.occurred_at.getTime());

    return {
        asset: {
            ...asset,
        },
        summary: {
            total_order_usages: orderUsages.length,
            total_scan_events: scanRows.length,
            total_service_requests: linkedServiceRequests.length,
            total_condition_updates: conditionRows.length,
            latest_activity_at: timeline[0]?.occurred_at || null,
        },
        timeline,
    };
};

// ----------------------------------- BULK GROUP ASSETS -----------------------------------
// Admin/Logistics action to gather N selected assets into a single group_id.
// Validation:
//   1. All selected assets must share the same company_id, brand_id, and stock_mode
//      (group sibling constraint per locked decision #3).
//   2. Any selected asset's existing group_id must match the target OR be NULL
//      (reject if any asset belongs to a different group — must un-group first).
//   3. Cross-group name uniqueness for the supplied group_name within the company.
//   4. target_group_id is reused if provided; otherwise a fresh UUID is generated.
//
// Atomic: writes group_id + group_name to all selected assets in one transaction.
const bulkGroupAssets = async (
    data: {
        asset_ids: string[];
        target_group_id?: string;
        group_name: string;
        group_images?: { url: string; note?: string }[];
        group_on_display_image?: string | null;
    },
    _user: AuthUser,
    platformId: string
) => {
    if (!data.asset_ids || data.asset_ids.length < 2) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Bulk-group requires at least 2 asset IDs"
        );
    }

    return db.transaction(async (tx) => {
        const selected = await tx
            .select({
                id: assets.id,
                company_id: assets.company_id,
                brand_id: assets.brand_id,
                stock_mode: assets.stock_mode,
                group_id: assets.group_id,
            })
            .from(assets)
            .where(
                and(
                    inArray(assets.id, data.asset_ids),
                    eq(assets.platform_id, platformId),
                    isNull(assets.deleted_at)
                )
            );

        if (selected.length !== data.asset_ids.length) {
            throw new CustomizedError(
                httpStatus.NOT_FOUND,
                "One or more selected assets were not found"
            );
        }

        // (1) Company/brand/stock_mode parity check
        const firstCompany = selected[0].company_id;
        const firstBrand = selected[0].brand_id;
        const firstStockMode = selected[0].stock_mode;
        for (const row of selected) {
            if (row.company_id !== firstCompany) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "All selected assets must share the same company"
                );
            }
            if ((row.brand_id ?? null) !== (firstBrand ?? null)) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "All selected assets must share the same brand"
                );
            }
            if (row.stock_mode !== firstStockMode) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "All selected assets must share the same stock_mode (SERIALIZED or POOLED)"
                );
            }
        }

        // (2) Group conflict check
        const targetGroupId = data.target_group_id ?? randomUUID();
        for (const row of selected) {
            if (row.group_id && row.group_id !== targetGroupId) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    "One or more selected assets already belong to a different group — un-group them first"
                );
            }
        }

        // (3) Cross-group name uniqueness within the company
        await validateGroupNameUniqueness(tx, {
            platformId,
            companyId: firstCompany,
            groupName: data.group_name,
            currentGroupId: targetGroupId,
        });

        // (4) Atomic write
        const promotedGroupImages =
            data.group_images && data.group_images.length > 0
                ? await promoteDraftImages(data.group_images, firstCompany)
                : [];

        await tx
            .update(assets)
            .set({
                group_id: targetGroupId,
                group_name: data.group_name,
                group_images: promotedGroupImages,
                group_on_display_image: data.group_on_display_image ?? null,
            })
            .where(inArray(assets.id, data.asset_ids));

        return {
            group_id: targetGroupId,
            group_name: data.group_name,
            group_images: promotedGroupImages,
            group_on_display_image: data.group_on_display_image ?? null,
            assets_grouped: data.asset_ids.length,
        };
    });
};

/**
 * Company Back Office asset edit — a deliberately NARROW path, distinct from
 * the broad ADMIN/LOGISTICS updateAsset. A company manager (CLIENT +
 * company:edit_assets) may change ONLY presentation fields:
 *   name, on_display_image, description, category, brand_id
 * Everything else (dimensions/weight/volume → pricing; condition/refurb →
 * booking windows; quantities/stock_mode/qr/status → inventory & identity) is
 * structurally unreachable: the update object is allowlisted server-side, so a
 * hostile payload with extra keys is silently ignored. brand_id is validated to
 * belong to the caller's company; on_display_image reuses the draft→permanent
 * S3 promotion; the change is recorded as an asset version snapshot.
 */
const COMPANY_EDITABLE_ASSET_FIELDS = [
    "name",
    "on_display_image",
    "description",
    "category",
    "brand_id",
    // Lone-asset gallery (tagged source:'CLIENT', scan-safe via the merge).
    "images",
    // Grouped gallery + rename — cascade to all siblings sharing group_id.
    "group_name",
    "group_images",
    "group_on_display_image",
] as const;

const companyEditAsset = async (
    id: string,
    data: Record<string, unknown>,
    user: AuthUser,
    platformId: string
) => {
    const existing = await db.query.assets.findFirst({
        where: and(eq(assets.id, id), eq(assets.platform_id, platformId)),
    });
    if (!existing) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");
    }
    // Cross-tenant backstop: the asset must belong to the manager's company.
    assertCompanyScopeOrManager(user, existing, "asset");

    // Allowlist — only these fields are ever written.
    const incoming: Record<string, unknown> = {};
    for (const field of COMPANY_EDITABLE_ASSET_FIELDS) {
        if (data[field] !== undefined) incoming[field] = data[field];
    }
    if (Object.keys(incoming).length === 0) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "No editable fields provided");
    }

    const companyId = existing.company_id as string;

    // A new brand must belong to the same company (null clears the brand).
    if (incoming.brand_id) {
        const [brand] = await db
            .select({ id: brands.id })
            .from(brands)
            .where(
                and(eq(brands.id, incoming.brand_id as string), eq(brands.company_id, companyId))
            );
        if (!brand) {
            throw new CustomizedError(
                httpStatus.NOT_FOUND,
                "Brand not found or does not belong to your company"
            );
        }
    }

    // Promote freshly-uploaded media (drafts/ → permanent) and tag galleries CLIENT
    // so the inbound scan merge never deletes them.
    //
    // The lone-asset `images` column is shared with scan media. CBO curates only
    // the CLIENT gallery, so this is a merge from the client side mirroring the
    // scan-side merge: replace the CLIENT entries with what the client sent, but
    // PRESERVE every existing SCAN entry (client photos first, scan after).
    if (Array.isArray(incoming.images) && companyId) {
        const promotedClient = tagImagesClient(
            await promoteDraftImages(incoming.images as AssetImageEntry[], companyId)
        );
        const clientUrls = new Set(promotedClient.map((entry) => entry.url));
        const existingScan = (
            Array.isArray(existing.images) ? (existing.images as AssetImageEntry[]) : []
        ).filter((entry) => entry?.source === "SCAN" && !clientUrls.has(entry.url as string));
        incoming.images = [...promotedClient, ...existingScan];
    }
    if (Array.isArray(incoming.group_images) && companyId) {
        incoming.group_images = tagImagesClient(
            await promoteDraftImages(incoming.group_images as AssetImageEntry[], companyId)
        );
    }
    if (incoming.on_display_image && companyId) {
        const [promoted] = await promoteDraftImages(
            [{ url: incoming.on_display_image as string }],
            companyId
        );
        incoming.on_display_image = promoted.url;
    }
    if (incoming.group_on_display_image && companyId) {
        const [promoted] = await promoteDraftImages(
            [{ url: incoming.group_on_display_image as string }],
            companyId
        );
        incoming.group_on_display_image = promoted.url;
    }

    // For a GROUP, the curated gallery is written into EACH sibling's OWN `images`
    // (tagged source:'CLIENT', merged with that sibling's OWN scan photos) and its
    // OWN `on_display_image` — so every child asset physically carries the photos.
    // The same values are mirrored to the group-level columns the catalog reads.
    // For a LONE asset (group_id NULL) the group_* fields are meaningless.
    const isGroup = Boolean(existing.group_id);
    const newGroupName = typeof incoming.group_name === "string" ? incoming.group_name : null;
    const renamingGroup = isGroup && newGroupName !== null;

    // Curated CLIENT gallery + cover for a group (already promoted + CLIENT-tagged
    // above). `undefined` means the field was not part of this edit.
    const groupClientImages =
        isGroup && incoming.group_images !== undefined
            ? (incoming.group_images as AssetImageEntry[])
            : undefined;
    const groupCover =
        isGroup && incoming.group_on_display_image !== undefined
            ? (incoming.group_on_display_image as string | null)
            : undefined;

    // Group-only + lone-only image fields are applied per sibling below, not via
    // the flat per-row payload.
    delete incoming.group_name;
    delete incoming.group_images;
    delete incoming.group_on_display_image;
    if (isGroup) delete incoming.images;
    // On a group rename each sibling's `name` is re-derived (preserving its #N).
    if (renamingGroup) delete incoming.name;

    // Reject a cross-group name collision within the company before mutating.
    if (renamingGroup) {
        await validateGroupNameUniqueness(db, {
            platformId,
            companyId,
            groupName: newGroupName,
            currentGroupId: existing.group_id,
        });
    }

    const now = new Date();

    await db.transaction(async (tx) => {
        if (!isGroup) {
            await tx
                .update(assets)
                .set({ ...incoming, updated_at: now })
                .where(eq(assets.id, id));
            return;
        }

        // Load siblings with their own images so each one's scan photos survive.
        const siblings = await tx
            .select({ id: assets.id, name: assets.name, images: assets.images })
            .from(assets)
            .where(
                and(
                    eq(assets.platform_id, platformId),
                    eq(assets.group_id, existing.group_id as string),
                    isNull(assets.deleted_at)
                )
            );

        const clientUrls = groupClientImages
            ? new Set(groupClientImages.map((entry) => entry.url))
            : null;

        for (const sib of siblings) {
            const set: Record<string, unknown> = { updated_at: now };

            // Curated gallery → this sibling's OWN images (CLIENT), keeping its own
            // scan photos; mirror to group_images for the catalog group gallery.
            if (groupClientImages && clientUrls) {
                const sibScan = (
                    Array.isArray(sib.images) ? (sib.images as AssetImageEntry[]) : []
                ).filter(
                    (entry) => entry?.source === "SCAN" && !clientUrls.has(entry.url as string)
                );
                set.images = [...groupClientImages, ...sibScan];
                set.group_images = groupClientImages;
            }

            // Cover → this sibling's OWN on_display_image + the group cover column.
            if (groupCover !== undefined) {
                set.on_display_image = groupCover;
                set.group_on_display_image = groupCover;
            }

            // Group label + #N re-derivation (snapshot freeze intact — no
            // order_items/sp_items asset_name is touched).
            if (renamingGroup) {
                set.group_name = newGroupName;
                const { suffixNumber } = parseAssetNameSeries(sib.name);
                set.name = suffixNumber != null ? `${newGroupName} #${suffixNumber}` : newGroupName;
            }

            // Per-row presentation fields apply to the edited sibling only.
            if (sib.id === id) {
                if (incoming.description !== undefined) set.description = incoming.description;
                if (incoming.category !== undefined) set.category = incoming.category;
                if (incoming.brand_id !== undefined) set.brand_id = incoming.brand_id;
            }

            // Skip a no-op write on a non-edited sibling.
            if (sib.id !== id && Object.keys(set).length === 1) continue;

            await tx.update(assets).set(set).where(eq(assets.id, sib.id));
        }
    });

    await createAssetVersionSnapshot(id, platformId, "Company manager update", user.id);

    const updated = await db.query.assets.findFirst({ where: eq(assets.id, id) });
    return updated;
};

export const AssetServices = {
    createAsset,
    getAssets,
    getAssetById,
    updateAsset,
    companyEditAsset,
    addAssetUnits,
    bulkGroupAssets,
    deleteAsset,
    getAssetAvailabilityStats,
    getAssetScanHistory,
    getAvailability,
    addConditionHistory,
    updateAssetCondition,
    generateQRCode,
    sentAssetToMaintenance,
    completeAssetMaintenance,
    createAssetVersionSnapshot,
    getAssetVersions,
    getAssetOrderHistory,
    getAssetUsageReport,
};
