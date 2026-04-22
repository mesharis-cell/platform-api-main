import { and, eq, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    assetBookings,
    assetConditionHistory,
    assets,
    scanEventAssets,
    scanEventMedia,
    scanEvents,
    selfPickupItems,
    selfPickupStatusHistory,
    selfPickups,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { eventBus, EVENT_TYPES } from "../../events";
import { releaseBookingsAndRestoreAvailability } from "../order/order.utils";
import { StockMovementService } from "../../services/stock-movement.service";
import { SelfPickupServices } from "../self-pickup/self-pickup.services";
import type {
    PooledSettlementEntry,
    ScanMediaPayload,
    UnsettledPooledLine,
} from "./scanning.interfaces";

// Reuse shared helpers from scanning.services.ts
// normalizeMediaEntries, insertScanEventMedia, insertScanEventAssets are not exported
// from scanning.services.ts. For now, inline the minimal versions.

type NormalizedMediaEntry = {
    url: string;
    note?: string;
};

const normalizeMediaEntries = (entries?: ScanMediaPayload[]): NormalizedMediaEntry[] => {
    const normalized = new Map<string, string | undefined>();
    (entries || []).forEach((entry) => {
        const url = entry?.url?.trim();
        if (!url) return;
        const note = entry.note?.trim();
        normalized.set(url, note && note.length > 0 ? note : undefined);
    });
    return Array.from(normalized.entries()).map(([url, note]) => ({ url, note }));
};

const insertScanEventMedia = async (
    scanEventId: string,
    media: NormalizedMediaEntry[],
    mediaKind:
        | "GENERAL"
        | "RETURN_WIDE"
        | "DAMAGE"
        | "DERIG"
        | "TRUCK_OUTBOUND"
        | "TRUCK_RETURN"
        | "ON_SITE"
) => {
    if (media.length === 0) return;
    await db.insert(scanEventMedia).values(
        media.map((item, index) => ({
            scan_event_id: scanEventId,
            url: item.url,
            note: item.note ?? null,
            media_kind: mediaKind,
            sort_order: index,
        }))
    );
};

const insertScanEventAssets = async (
    scanEventId: string,
    assetRows: Array<{ asset_id: string; quantity?: number }>
) => {
    if (assetRows.length === 0) return;
    await db
        .insert(scanEventAssets)
        .values(
            assetRows.map((row) => ({
                scan_event_id: scanEventId,
                asset_id: row.asset_id,
                quantity: Math.max(row.quantity ?? 0, 0),
            }))
        )
        .onConflictDoNothing();
};

// ----------------------------------- HANDOVER SCAN (OUTBOUND) ----------------------------

const selfPickupOutboundScan = async (
    selfPickupId: string,
    data: { qr_code: string; quantity?: number; note?: string },
    user: AuthUser,
    platformId: string
) => {
    const pickup = await db.query.selfPickups.findFirst({
        where: and(eq(selfPickups.id, selfPickupId), eq(selfPickups.platform_id, platformId)),
        with: { items: true },
    });

    if (!pickup) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");

    if (pickup.self_pickup_status !== "READY_FOR_PICKUP") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Handover scanning not allowed in status: ${pickup.self_pickup_status}. Must be READY_FOR_PICKUP.`
        );
    }

    const asset = await db.query.assets.findFirst({
        where: and(eq(assets.qr_code, data.qr_code), eq(assets.platform_id, platformId)),
    });

    if (!asset)
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found with this QR code");

    // Mirror order-scan's TRANSFORMED redirect (scanning.services.ts:149-172).
    // If the QR belongs to an asset that's been rebranded/replaced, tell the
    // scanner to scan the successor instead of erroring out as "not in pickup".
    if (asset.status === "TRANSFORMED") {
        if (!asset.transformed_to) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Asset has been transformed and is no longer scannable"
            );
        }
        const newAsset = await db.query.assets.findFirst({
            where: eq(assets.id, asset.transformed_to),
        });
        if (newAsset) {
            return {
                message: "Asset has been transformed. Please scan the new asset QR code.",
                asset,
                redirect_asset: {
                    id: newAsset.id,
                    name: newAsset.name,
                    qr_code: newAsset.qr_code,
                },
            };
        }
    }

    const pickupItem = pickup.items.find((item) => item.asset_id === asset.id);
    if (!pickupItem)
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Asset not in this self-pickup");

    let scanQuantity = 1;
    if (asset.tracking_method === "BATCH") {
        if (!data.quantity || data.quantity < 1) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Quantity required for BATCH assets");
        }
        scanQuantity = data.quantity;
    }

    const existingScans = await db.query.scanEvents.findMany({
        where: and(
            eq(scanEvents.self_pickup_id, selfPickupId),
            eq(scanEvents.asset_id, asset.id),
            eq(scanEvents.scan_type, "OUTBOUND")
        ),
    });

    const alreadyScanned = existingScans.reduce((sum, s) => sum + s.quantity, 0);
    if (alreadyScanned + scanQuantity > pickupItem.quantity) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot scan ${scanQuantity} units. Already: ${alreadyScanned}, Required: ${pickupItem.quantity}`
        );
    }

    const [scanEvent] = await db
        .insert(scanEvents)
        .values({
            self_pickup_id: selfPickupId,
            asset_id: asset.id,
            scan_type: "OUTBOUND",
            quantity: scanQuantity,
            condition: "GREEN",
            notes: data.note || null,
            scanned_by: user.id,
            scanned_at: new Date(),
        })
        .returning({ id: scanEvents.id });

    await insertScanEventAssets(scanEvent.id, [{ asset_id: asset.id, quantity: scanQuantity }]);

    if (asset.tracking_method === "BATCH") {
        await StockMovementService.record(null, {
            platformId,
            assetId: asset.id,
            delta: -scanQuantity,
            movementType: "OUTBOUND",
            linkedEntityType: "SELF_PICKUP",
            linkedEntityId: selfPickupId,
            scanEventId: scanEvent.id,
            userId: user.id,
        });
    }

    await db
        .update(assets)
        .set({ status: "OUT", last_scanned_at: new Date(), last_scanned_by: user.id })
        .where(eq(assets.id, asset.id));

    // Calculate progress
    const allOutbound = await db.query.scanEvents.findMany({
        where: and(
            eq(scanEvents.self_pickup_id, selfPickupId),
            eq(scanEvents.scan_type, "OUTBOUND")
        ),
    });
    const totalScanned = allOutbound.reduce((sum, s) => sum + s.quantity, 0);
    const totalRequired = pickup.items.reduce((sum, item) => sum + item.quantity, 0);

    return {
        asset: {
            asset_id: asset.id,
            asset_name: asset.name,
            scanned_quantity: alreadyScanned + scanQuantity,
            required_quantity: pickupItem.quantity,
        },
        progress: {
            total_items: totalRequired,
            items_scanned: totalScanned,
            percent_complete: Math.round((totalScanned / totalRequired) * 100),
        },
    };
};

// ----------------------------------- COMPLETE HANDOVER -----------------------------------

const completeSelfPickupHandover = async (
    selfPickupId: string,
    user: AuthUser,
    platformId: string,
    body: {
        allow_partial?: boolean;
        partial_reason?: string;
        items?: Array<{ self_pickup_item_id: string; scanned_quantity: number }>;
    } = {}
) => {
    const pickup = await db.query.selfPickups.findFirst({
        where: and(eq(selfPickups.id, selfPickupId), eq(selfPickups.platform_id, platformId)),
        with: { items: true, company: { columns: { name: true } } },
    });

    if (!pickup) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");
    if (pickup.self_pickup_status !== "READY_FOR_PICKUP") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot complete handover in status: ${pickup.self_pickup_status}`
        );
    }

    const outboundScans = await db.query.scanEvents.findMany({
        where: and(
            eq(scanEvents.self_pickup_id, selfPickupId),
            eq(scanEvents.scan_type, "OUTBOUND")
        ),
    });

    // Compute per-item actual scanned quantity from scan_events (source of
    // truth). The `items[]` body field, if provided, must match these
    // numbers — we don't trust client-asserted qty.
    const scannedByItemId = new Map<string, number>();
    const scannedByAssetId = new Map<string, number>();
    for (const item of pickup.items) {
        const assetScans = outboundScans.filter((s) => s.asset_id === item.asset_id);
        const qty = assetScans.reduce((sum, s) => sum + s.quantity, 0);
        scannedByItemId.set(item.id, qty);
        scannedByAssetId.set(item.asset_id, qty);
    }
    const totalScanned = outboundScans.reduce((sum, s) => sum + s.quantity, 0);
    const totalRequired = pickup.items.reduce((sum, item) => sum + item.quantity, 0);
    const isPartial = totalScanned < totalRequired;

    if (isPartial) {
        // Partial handover is NO_COST-only for now (pricing rules deferred).
        if ((pickup as any).pricing_mode !== "NO_COST") {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Partial handover is only available on No-Cost pickups. Ask admin to mark this pickup as No-Cost first, or scan every unit."
            );
        }
        if (!body.allow_partial) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Not all items scanned. Scanned: ${totalScanned}, Required: ${totalRequired}. Pass allow_partial=true with a reason to finalize a partial handover.`
            );
        }
        if (!body.partial_reason || body.partial_reason.trim().length < 5) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "A reason (min 5 characters) is required for partial handover"
            );
        }
        // Validate any client-sent items[] matches the actual scan_events tallies.
        if (body.items) {
            for (const entry of body.items) {
                const actual = scannedByItemId.get(entry.self_pickup_item_id);
                if (actual === undefined) {
                    throw new CustomizedError(
                        httpStatus.BAD_REQUEST,
                        `Unknown self_pickup_item_id in body: ${entry.self_pickup_item_id}`
                    );
                }
                if (actual !== entry.scanned_quantity) {
                    throw new CustomizedError(
                        httpStatus.BAD_REQUEST,
                        `Item ${entry.self_pickup_item_id}: body says ${entry.scanned_quantity} but scan history shows ${actual}. Rescan or correct the body.`
                    );
                }
            }
        }
    }

    // Persist scanned_quantity + skipped + partial_reason on each item row,
    // then (only if partial) reduce the remaining bookings so return-flow
    // and inventory math reflect the actual collection.
    await db.transaction(async (tx) => {
        for (const item of pickup.items) {
            const qty = scannedByItemId.get(item.id) ?? 0;
            await tx
                .update(selfPickupItems)
                .set({
                    scanned_quantity: qty,
                    skipped: qty === 0,
                    partial_reason:
                        isPartial && qty < item.quantity ? (body.partial_reason ?? null) : null,
                })
                .where(eq(selfPickupItems.id, item.id));
        }
        if (isPartial) {
            const { reduceBookingsForScannedOutbound } = await import("../order/order.utils");
            await reduceBookingsForScannedOutbound(
                tx,
                "SELF_PICKUP",
                selfPickupId,
                platformId,
                scannedByAssetId
            );
        }
    });

    const transitionNote = isPartial
        ? `Partial handover — scanned ${totalScanned}/${totalRequired}. Reason: ${body.partial_reason}`
        : "All items handed over to collector";

    // Route through transitionStatus so BOTH the specific event
    // (SELF_PICKUP_PICKED_UP) and the generic SELF_PICKUP_STATUS_CHANGED
    // fire — mirrors the pattern every other SP transition uses.
    return SelfPickupServices.transitionStatus(
        pickup.id,
        platformId,
        user,
        "PICKED_UP",
        transitionNote,
        isPartial
            ? {
                  partial: true,
                  total_scanned: totalScanned,
                  total_required: totalRequired,
                  partial_reason: body.partial_reason,
              }
            : {}
    );
};

// ----------------------------------- RETURN SCAN (INBOUND) --------------------------------

const selfPickupInboundScan = async (
    selfPickupId: string,
    data: {
        qr_code: string;
        condition: "GREEN" | "ORANGE" | "RED";
        quantity?: number;
        notes?: string;
        return_media?: ScanMediaPayload[];
        damage_media?: ScanMediaPayload[];
        refurb_days_estimate?: number;
        discrepancy_reason?: "BROKEN" | "LOST" | "OTHER";
    },
    user: AuthUser,
    platformId: string
) => {
    const normalizedReturnMedia = normalizeMediaEntries(data.return_media);
    const normalizedDamageMedia = normalizeMediaEntries(data.damage_media);

    const pickup = await db.query.selfPickups.findFirst({
        where: and(eq(selfPickups.id, selfPickupId), eq(selfPickups.platform_id, platformId)),
        with: { items: { with: { asset: true } } },
    });

    if (!pickup) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");
    if (!["AWAITING_RETURN"].includes(pickup.self_pickup_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Return scanning not allowed in status: ${pickup.self_pickup_status}`
        );
    }

    const asset = await db.query.assets.findFirst({
        where: and(eq(assets.qr_code, data.qr_code), eq(assets.platform_id, platformId)),
    });
    if (!asset) throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");

    // TRANSFORMED redirect — mirror of outbound path above + order-scan pattern.
    // Prevents the misleading "Asset not in this self-pickup" error when the
    // QR belongs to a rebranded/replaced asset.
    if (asset.status === "TRANSFORMED") {
        if (!asset.transformed_to) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Asset has been transformed and is no longer scannable"
            );
        }
        const newAsset = await db.query.assets.findFirst({
            where: eq(assets.id, asset.transformed_to),
        });
        if (newAsset) {
            return {
                message: "Asset has been transformed. Please scan the new asset QR code.",
                asset,
                redirect_asset: {
                    id: newAsset.id,
                    name: newAsset.name,
                    qr_code: newAsset.qr_code,
                },
            };
        }
    }

    const pickupItem = pickup.items.find((item) => item.asset_id === asset.id);
    if (!pickupItem)
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Asset not in this self-pickup");

    let scanQuantity = 1;
    if (asset.tracking_method === "BATCH") {
        if (!data.quantity || data.quantity < 1) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Quantity required for BATCH assets");
        }
        scanQuantity = data.quantity;
    }

    // Server-side re-validation (defense in depth on top of schema validation).
    if (normalizedReturnMedia.length < 2) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "At least 2 wide return photos are required for inbound self-pickup scans"
        );
    }
    if (data.condition !== "GREEN" && normalizedDamageMedia.length === 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "At least one damage report photo is required for damaged returns"
        );
    }

    // Over-scan guard (INBOUND parity with OUTBOUND at line 163). Expected
    // return qty is the actual scanned_quantity from the handover (set by
    // migration 0048). Falls back to ordered quantity for records created
    // before 0048 landed. Prevents returning more units than were collected.
    const expectedReturnQty = (pickupItem as any).scanned_quantity ?? pickupItem.quantity;
    if (expectedReturnQty === 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "This item was not collected at handover and cannot be returned"
        );
    }
    const existingReturnScans = await db.query.scanEvents.findMany({
        where: and(
            eq(scanEvents.self_pickup_id, selfPickupId),
            eq(scanEvents.asset_id, asset.id),
            eq(scanEvents.scan_type, "INBOUND")
        ),
    });
    const alreadyReturned = existingReturnScans.reduce((sum, s) => sum + s.quantity, 0);
    if (alreadyReturned + scanQuantity > expectedReturnQty) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot return ${scanQuantity} units. Already returned: ${alreadyReturned}, Expected: ${expectedReturnQty}`
        );
    }

    const [scanEvent] = await db
        .insert(scanEvents)
        .values({
            self_pickup_id: selfPickupId,
            asset_id: asset.id,
            scan_type: "INBOUND",
            quantity: scanQuantity,
            condition: data.condition,
            notes: data.notes || null,
            discrepancy_reason: data.discrepancy_reason || null,
            metadata: {
                return_media_count: normalizedReturnMedia.length,
                damage_media_count: normalizedDamageMedia.length,
                refurb_days_estimate: data.refurb_days_estimate ?? null,
            },
            scanned_by: user.id,
            scanned_at: new Date(),
        })
        .returning({ id: scanEvents.id });

    await insertScanEventAssets(scanEvent.id, [{ asset_id: asset.id, quantity: scanQuantity }]);
    await insertScanEventMedia(scanEvent.id, normalizedReturnMedia, "RETURN_WIDE");
    await insertScanEventMedia(scanEvent.id, normalizedDamageMedia, "DAMAGE");

    if (asset.tracking_method === "BATCH") {
        await StockMovementService.record(null, {
            platformId,
            assetId: asset.id,
            delta: scanQuantity,
            movementType: "INBOUND",
            linkedEntityType: "SELF_PICKUP",
            linkedEntityId: selfPickupId,
            scanEventId: scanEvent.id,
            userId: user.id,
        });
    }

    // Update asset condition + record condition history for damage tracking —
    // mirrors order inbound scan behavior at scanning.services.ts:263-300.
    if (asset.condition !== data.condition) {
        const updateData: {
            condition: "GREEN" | "ORANGE" | "RED";
            last_scanned_at: Date;
            last_scanned_by: string;
            refurb_days_estimate?: number | null;
            status: "AVAILABLE";
        } = {
            condition: data.condition,
            last_scanned_at: new Date(),
            last_scanned_by: user.id,
            status: "AVAILABLE",
        };

        if (data.condition === "GREEN") {
            updateData.refurb_days_estimate = null;
        } else if (data.refurb_days_estimate) {
            updateData.refurb_days_estimate = data.refurb_days_estimate;
        }

        await db.update(assets).set(updateData).where(eq(assets.id, asset.id));

        await db.insert(assetConditionHistory).values({
            platform_id: platformId,
            asset_id: asset.id,
            condition: data.condition,
            notes: data.notes || null,
            photos: normalizedDamageMedia.map((entry) => entry.url),
            damage_report_entries: normalizedDamageMedia.map((entry) => ({
                url: entry.url,
                description: entry.note,
            })),
            updated_by: user.id,
        });
    } else {
        await db
            .update(assets)
            .set({
                status: "AVAILABLE",
                last_scanned_at: new Date(),
                last_scanned_by: user.id,
            })
            .where(eq(assets.id, asset.id));
    }

    const allInbound = await db.query.scanEvents.findMany({
        where: and(
            eq(scanEvents.self_pickup_id, selfPickupId),
            eq(scanEvents.scan_type, "INBOUND")
        ),
    });
    const totalScanned = allInbound.reduce((sum, s) => sum + s.quantity, 0);
    // Expected return = actual handover qty (migration 0048). Fallback to
    // original ordered qty for records created pre-0048.
    const totalRequired = pickup.items.reduce(
        (sum, item) => sum + ((item as any).scanned_quantity ?? item.quantity),
        0
    );

    return {
        asset: { asset_id: asset.id, asset_name: asset.name },
        progress: {
            total_items: totalRequired,
            items_scanned: totalScanned,
            percent_complete:
                totalRequired === 0 ? 100 : Math.round((totalScanned / totalRequired) * 100),
        },
    };
};

// ----------------------------------- COMPLETE RETURN (WITH SETTLEMENT) --------------------

const completeSelfPickupReturn = async (
    selfPickupId: string,
    user: AuthUser,
    platformId: string,
    settlements: PooledSettlementEntry[] = []
) => {
    const pickup = await db.query.selfPickups.findFirst({
        where: and(eq(selfPickups.id, selfPickupId), eq(selfPickups.platform_id, platformId)),
        with: {
            items: {
                with: {
                    asset: {
                        columns: {
                            id: true,
                            name: true,
                            tracking_method: true,
                            available_quantity: true,
                        },
                    },
                },
            },
            company: { columns: { name: true } },
        },
    });

    if (!pickup) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");
    if (pickup.self_pickup_status !== "AWAITING_RETURN") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot complete return in status: ${pickup.self_pickup_status}`
        );
    }

    const inboundScans = await db.query.scanEvents.findMany({
        where: and(
            eq(scanEvents.self_pickup_id, selfPickupId),
            eq(scanEvents.scan_type, "INBOUND")
        ),
    });

    // Pooled-aware reconciliation (same logic as order completeInboundScan)
    const unsettledLines: UnsettledPooledLine[] = [];
    const settlementsToApply: Array<{
        item: (typeof pickup.items)[number];
        settlement: PooledSettlementEntry;
        delta: number;
    }> = [];

    for (const item of pickup.items) {
        const scannedQty = inboundScans
            .filter((s) => s.asset_id === item.asset_id)
            .reduce((sum, s) => sum + s.quantity, 0);
        const trackingMethod = (item.asset as any)?.tracking_method || "INDIVIDUAL";
        // Expected return = actual handover qty (migration 0048). Fallback to
        // item.quantity for records created pre-0048 or when scanned_quantity
        // wasn't set (legacy all-or-nothing path).
        const expectedQty = (item as any).scanned_quantity ?? item.quantity;
        if (expectedQty === 0) continue; // Skipped at handover — no return expected.
        const delta = scannedQty - expectedQty;

        if (trackingMethod === "INDIVIDUAL") {
            if (scannedQty < expectedQty) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    `Cannot complete: ${item.asset_name}: ${scannedQty}/${expectedQty} scanned`
                );
            }
        } else if (delta < 0) {
            const matching = settlements.find((s) => s.line_id === item.id);
            if (!matching) {
                unsettledLines.push({
                    line_id: item.id,
                    asset_id: item.asset_id,
                    asset_name: item.asset_name,
                    outbound_qty: expectedQty,
                    scanned_qty: scannedQty,
                    delta,
                });
            } else {
                settlementsToApply.push({ item, settlement: matching, delta });
            }
        }
    }

    if (unsettledLines.length > 0) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Pooled items require settlement", {
            requires_settlement: unsettledLines,
        } as any);
    }

    // Build returnedByAsset map for net restore
    const returnedByAsset = new Map<string, number>();
    for (const item of pickup.items) {
        const scannedQty = inboundScans
            .filter((s) => s.asset_id === item.asset_id)
            .reduce((sum, s) => sum + s.quantity, 0);
        returnedByAsset.set(item.asset_id, scannedQty);
    }

    await db.transaction(async (tx) => {
        await releaseBookingsAndRestoreAvailability(
            tx,
            "SELF_PICKUP",
            selfPickupId,
            platformId,
            returnedByAsset
        );

        for (const { item, settlement, delta } of settlementsToApply) {
            await StockMovementService.record(tx, {
                platformId,
                assetId: item.asset_id,
                delta,
                movementType: "WRITE_OFF",
                writeOffReason: settlement.write_off_reason,
                note: settlement.note,
                linkedEntityType: "SELF_PICKUP",
                linkedEntityId: selfPickupId,
                userId: user.id,
            });

            await tx
                .update(selfPickupItems)
                .set({ settled_at: new Date(), settled_by: user.id })
                .where(eq(selfPickupItems.id, item.id));
        }

        await tx
            .update(selfPickups)
            .set({ self_pickup_status: "CLOSED", financial_status: "PENDING_INVOICE" })
            .where(eq(selfPickups.id, selfPickupId));
        await tx.insert(selfPickupStatusHistory).values({
            platform_id: platformId,
            self_pickup_id: selfPickupId,
            status: "CLOSED",
            notes:
                settlementsToApply.length > 0
                    ? `Return completed with ${settlementsToApply.length} pooled settlement(s)`
                    : "Return completed — all items returned and inspected",
            updated_by: user.id,
        });
    });

    // Emit BOTH specific + generic events — mirrors transitionStatus pattern.
    // Return flow keeps its own transaction (settlements + financial_status
    // must be atomic with the status flip), so we can't delegate the whole
    // thing to transitionStatus; but we must still emit the generic event
    // so STATUS_CHANGED listeners (audit, cache invalidation) fire on CLOSED.
    const closedPayload = {
        entity_id_readable: pickup.self_pickup_id,
        company_id: pickup.company_id,
        company_name: (pickup.company as any)?.name || "N/A",
        collector_name: pickup.collector_name,
        collector_phone: pickup.collector_phone,
        pickup_window: pickup.pickup_window,
        settlements_applied: settlementsToApply.length,
    };
    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.SELF_PICKUP_CLOSED,
        entity_type: "SELF_PICKUP",
        entity_id: pickup.id,
        actor_id: user.id,
        actor_role: user.role,
        payload: closedPayload,
    });
    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.SELF_PICKUP_STATUS_CHANGED,
        entity_type: "SELF_PICKUP",
        entity_id: pickup.id,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            ...closedPayload,
            old_status: "AWAITING_RETURN",
            new_status: "CLOSED",
            notes: "",
        },
    });

    return { self_pickup_id: pickup.self_pickup_id, new_status: "CLOSED" };
};

// ----------------------------------- PROGRESS --------------------------------------------

const getSelfPickupHandoverProgress = async (selfPickupId: string, platformId: string) => {
    const pickup = await db.query.selfPickups.findFirst({
        where: and(eq(selfPickups.id, selfPickupId), eq(selfPickups.platform_id, platformId)),
        with: { items: { with: { asset: true } } },
    });
    if (!pickup) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");

    const outboundScans = await db.query.scanEvents.findMany({
        where: and(
            eq(scanEvents.self_pickup_id, selfPickupId),
            eq(scanEvents.scan_type, "OUTBOUND")
        ),
    });

    const assetsProgress = pickup.items.map((item) => {
        const scannedQty = outboundScans
            .filter((s) => s.asset_id === item.asset_id)
            .reduce((sum, s) => sum + s.quantity, 0);
        return {
            // Expose the pickup-item row id so the partial-handover finalize
            // modal can cite it in the body (items[].self_pickup_item_id).
            self_pickup_item_id: item.id,
            asset_id: item.asset_id,
            asset_name: item.asset_name,
            qr_code: (item.asset as any)?.qr_code,
            tracking_method: (item.asset as any)?.tracking_method,
            required_quantity: item.quantity,
            scanned_quantity: scannedQty,
            is_complete: scannedQty >= item.quantity,
            added_midflow: (item as any).added_midflow === true,
        };
    });

    const totalItems = pickup.items.reduce((sum, i) => sum + i.quantity, 0);
    const scannedItems = assetsProgress.reduce((sum, a) => sum + a.scanned_quantity, 0);

    return {
        self_pickup_id: pickup.self_pickup_id,
        self_pickup_status: pickup.self_pickup_status,
        total_items: totalItems,
        items_scanned: scannedItems,
        percent_complete: totalItems > 0 ? Math.round((scannedItems / totalItems) * 100) : 0,
        assets: assetsProgress,
    };
};

const getSelfPickupReturnProgress = async (selfPickupId: string, platformId: string) => {
    const pickup = await db.query.selfPickups.findFirst({
        where: and(eq(selfPickups.id, selfPickupId), eq(selfPickups.platform_id, platformId)),
        with: { items: { with: { asset: true } } },
    });
    if (!pickup) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");

    const inboundScans = await db.query.scanEvents.findMany({
        where: and(
            eq(scanEvents.self_pickup_id, selfPickupId),
            eq(scanEvents.scan_type, "INBOUND")
        ),
    });

    const assetsProgress = pickup.items.map((item) => {
        const scannedQty = inboundScans
            .filter((s) => s.asset_id === item.asset_id)
            .reduce((sum, s) => sum + s.quantity, 0);
        // Expected return = actual handover qty when known (migration 0048);
        // fallback to ordered qty for records created before 0048.
        const requiredQty = (item as any).scanned_quantity ?? item.quantity;
        return {
            asset_id: item.asset_id,
            asset_name: item.asset_name,
            qr_code: (item.asset as any)?.qr_code,
            tracking_method: (item.asset as any)?.tracking_method,
            required_quantity: requiredQty,
            scanned_quantity: scannedQty,
            is_complete: requiredQty === 0 ? true : scannedQty >= requiredQty,
            skipped_at_handover: requiredQty === 0 && item.quantity > 0,
        };
    });

    const totalItems = pickup.items.reduce(
        (sum, i) => sum + ((i as any).scanned_quantity ?? i.quantity),
        0
    );
    const scannedItems = assetsProgress.reduce((sum, a) => sum + a.scanned_quantity, 0);

    return {
        self_pickup_id: pickup.self_pickup_id,
        self_pickup_status: pickup.self_pickup_status,
        total_items: totalItems,
        items_scanned: scannedItems,
        percent_complete: totalItems > 0 ? Math.round((scannedItems / totalItems) * 100) : 0,
        assets: assetsProgress,
    };
};

// ----------------------------------- MID-FLOW ADD ITEM (F3) -----------------------------
//
// Allows logistics to add a NEW item to an already-confirmed self-pickup at
// handover time. Use-case: client shows up asking for an extra asset not on
// the original cart. Gated to NO_COST pickups for now; STANDARD mode pickups
// have pricing implications (quote revision) that haven't been designed yet.
//
// Flow mirrors submitSelfPickupFromCart's per-item loop:
//   1. Verify asset on same platform + company as the pickup
//   2. Availability check (available_quantity >= quantity)
//   3. Insert self_pickup_items with added_midflow=true + reason + actor
//   4. Insert asset_bookings with same blocked_from/until as existing SP
//   5. Decrement asset.available_quantity
//   6. Status history entry (no status change — still CONFIRMED/READY_FOR_PICKUP)
//   7. Emit generic item-added event for audit listeners

const addSelfPickupItemMidflow = async (
    selfPickupId: string,
    user: AuthUser,
    platformId: string,
    data: { asset_id: string; quantity: number; reason: string }
) => {
    const pickup = await db.query.selfPickups.findFirst({
        where: and(eq(selfPickups.id, selfPickupId), eq(selfPickups.platform_id, platformId)),
    });
    if (!pickup) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");

    // Gate #1: NO_COST-only for now. Pricing implications on STANDARD
    // pickups deferred to a separate sprint + feature flag.
    if ((pickup as any).pricing_mode !== "NO_COST") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Adding items mid-flow is only available on No-Cost pickups. Ask admin to mark this pickup as No-Cost first."
        );
    }

    // Gate #2: CONFIRMED or READY_FOR_PICKUP only. Before CONFIRMED, the SP
    // is still uncommitted (pricing review / approval). After handover the
    // booking lifecycle is already resolved — add-item doesn't make sense.
    if (!["CONFIRMED", "READY_FOR_PICKUP"].includes(pickup.self_pickup_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot add items to pickup in status: ${pickup.self_pickup_status}. Allowed: CONFIRMED, READY_FOR_PICKUP.`
        );
    }

    // Asset lookup + tenant scope. Company match + platform match mirror the
    // initial submit-from-cart check.
    const asset = await db.query.assets.findFirst({
        where: and(
            eq(assets.id, data.asset_id),
            eq(assets.platform_id, platformId),
            eq(assets.company_id, pickup.company_id)
        ),
    });
    if (!asset) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Asset not found or not available for this pickup's company"
        );
    }
    if (asset.available_quantity < data.quantity) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Insufficient stock for ${asset.name}: available ${asset.available_quantity}, requested ${data.quantity}`
        );
    }

    // Find an existing booking for this SP to crib the blocked_from/until
    // window from — keeps the new booking consistent with the original
    // pickup window so release logic + conflict checks stay uniform.
    const [existingBooking] = await db
        .select({
            blocked_from: assetBookings.blocked_from,
            blocked_until: assetBookings.blocked_until,
        })
        .from(assetBookings)
        .where(eq(assetBookings.self_pickup_id, selfPickupId))
        .limit(1);
    if (!existingBooking) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Cannot determine pickup window — no existing bookings found for this pickup"
        );
    }

    const itemVolume = parseFloat(asset.volume_per_unit) * data.quantity;
    const itemWeight = parseFloat(asset.weight_per_unit) * data.quantity;

    const insertedItem = await db.transaction(async (tx) => {
        const [newItem] = await tx
            .insert(selfPickupItems)
            .values({
                platform_id: platformId,
                self_pickup_id: selfPickupId,
                asset_id: asset.id,
                asset_name: asset.name,
                quantity: data.quantity,
                volume_per_unit: asset.volume_per_unit,
                weight_per_unit: asset.weight_per_unit,
                total_volume: itemVolume.toFixed(3),
                total_weight: itemWeight.toFixed(2),
                condition_notes: null,
                handling_tags: [],
                from_collection: null,
                from_collection_name: null,
                added_midflow: true,
                added_midflow_reason: data.reason,
                added_midflow_by: user.id,
                added_midflow_at: new Date(),
            })
            .returning();

        await tx.insert(assetBookings).values({
            asset_id: asset.id,
            self_pickup_id: selfPickupId,
            quantity: data.quantity,
            blocked_from: existingBooking.blocked_from,
            blocked_until: existingBooking.blocked_until,
        });

        await tx
            .update(assets)
            .set({
                available_quantity: sql`GREATEST(0, ${assets.available_quantity} - ${data.quantity})`,
            })
            .where(eq(assets.id, asset.id));

        await tx.insert(selfPickupStatusHistory).values({
            platform_id: platformId,
            self_pickup_id: selfPickupId,
            status: pickup.self_pickup_status,
            notes: `Item added mid-handover: ${asset.name} x${data.quantity} — reason: ${data.reason}`,
            updated_by: user.id,
        });

        return newItem;
    });

    // Emit for audit / notification listeners. Using the generic
    // STATUS_CHANGED as the rendezvous since we don't have a dedicated
    // ITEM_ADDED_MIDFLOW event type (adding one would require event-types
    // wiring + templates; overkill for the initial ship).
    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.SELF_PICKUP_STATUS_CHANGED,
        entity_type: "SELF_PICKUP",
        entity_id: selfPickupId,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            entity_id_readable: pickup.self_pickup_id,
            company_id: pickup.company_id,
            old_status: pickup.self_pickup_status,
            new_status: pickup.self_pickup_status,
            event_kind: "ITEM_ADDED_MIDFLOW",
            asset_id: asset.id,
            asset_name: asset.name,
            quantity: data.quantity,
            reason: data.reason,
        },
    });

    return {
        self_pickup_id: pickup.self_pickup_id,
        new_item: insertedItem,
    };
};

export const SelfPickupScanningServices = {
    selfPickupOutboundScan,
    addSelfPickupItemMidflow,
    completeSelfPickupHandover,
    selfPickupInboundScan,
    completeSelfPickupReturn,
    getSelfPickupHandoverProgress,
    getSelfPickupReturnProgress,
};
