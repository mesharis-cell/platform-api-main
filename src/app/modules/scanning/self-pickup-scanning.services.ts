import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    assets,
    scanEventAssets,
    scanEvents,
    selfPickupItems,
    selfPickupStatusHistory,
    selfPickups,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { eventBus } from "../../events";
import { releaseBookingsAndRestoreAvailability } from "../order/order.utils";
import { StockMovementService } from "../../services/stock-movement.service";
import type { PooledSettlementEntry, UnsettledPooledLine } from "./scanning.interfaces";

// Reuse shared helpers from scanning.services.ts
// normalizeMediaEntries, insertScanEventMedia, insertScanEventAssets are not exported
// from scanning.services.ts. For now, inline the minimal versions.

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

    if (!asset) throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found with this QR code");

    const pickupItem = pickup.items.find((item) => item.asset_id === asset.id);
    if (!pickupItem) throw new CustomizedError(httpStatus.BAD_REQUEST, "Asset not in this self-pickup");

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
            platformId, assetId: asset.id, familyId: asset.family_id,
            delta: -scanQuantity, movementType: "OUTBOUND",
            linkedEntityType: "SELF_PICKUP", linkedEntityId: selfPickupId,
            scanEventId: scanEvent.id, userId: user.id,
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
        asset: { asset_id: asset.id, asset_name: asset.name, scanned_quantity: alreadyScanned + scanQuantity, required_quantity: pickupItem.quantity },
        progress: { total_items: totalRequired, items_scanned: totalScanned, percent_complete: Math.round((totalScanned / totalRequired) * 100) },
    };
};

// ----------------------------------- COMPLETE HANDOVER -----------------------------------

const completeSelfPickupHandover = async (
    selfPickupId: string,
    user: AuthUser,
    platformId: string
) => {
    const pickup = await db.query.selfPickups.findFirst({
        where: and(eq(selfPickups.id, selfPickupId), eq(selfPickups.platform_id, platformId)),
        with: { items: true, company: { columns: { name: true } } },
    });

    if (!pickup) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");
    if (pickup.self_pickup_status !== "READY_FOR_PICKUP") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, `Cannot complete handover in status: ${pickup.self_pickup_status}`);
    }

    const outboundScans = await db.query.scanEvents.findMany({
        where: and(eq(scanEvents.self_pickup_id, selfPickupId), eq(scanEvents.scan_type, "OUTBOUND")),
    });

    const totalScanned = outboundScans.reduce((sum, s) => sum + s.quantity, 0);
    const totalRequired = pickup.items.reduce((sum, item) => sum + item.quantity, 0);

    if (totalScanned < totalRequired) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, `Not all items scanned. Scanned: ${totalScanned}, Required: ${totalRequired}`);
    }

    await db.transaction(async (tx) => {
        await tx.update(selfPickups).set({ self_pickup_status: "PICKED_UP" }).where(eq(selfPickups.id, selfPickupId));
        await tx.insert(selfPickupStatusHistory).values({
            platform_id: platformId,
            self_pickup_id: selfPickupId,
            status: "PICKED_UP",
            notes: "All items handed over to collector",
            updated_by: user.id,
        });
    });

    await eventBus.emit({
        platform_id: platformId,
        event_type: "self_pickup.picked_up",
        entity_type: "SELF_PICKUP",
        entity_id: pickup.id,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            entity_id_readable: pickup.self_pickup_id,
            company_id: pickup.company_id,
            company_name: (pickup.company as any)?.name || "N/A",
            collector_name: pickup.collector_name,
        },
    });

    return { self_pickup_id: pickup.self_pickup_id, new_status: "PICKED_UP" };
};

// ----------------------------------- RETURN SCAN (INBOUND) --------------------------------

const selfPickupInboundScan = async (
    selfPickupId: string,
    data: { qr_code: string; condition: "GREEN" | "ORANGE" | "RED"; quantity?: number; notes?: string },
    user: AuthUser,
    platformId: string
) => {
    const pickup = await db.query.selfPickups.findFirst({
        where: and(eq(selfPickups.id, selfPickupId), eq(selfPickups.platform_id, platformId)),
        with: { items: { with: { asset: true } } },
    });

    if (!pickup) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");
    if (!["AWAITING_RETURN"].includes(pickup.self_pickup_status)) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, `Return scanning not allowed in status: ${pickup.self_pickup_status}`);
    }

    const asset = await db.query.assets.findFirst({
        where: and(eq(assets.qr_code, data.qr_code), eq(assets.platform_id, platformId)),
    });
    if (!asset) throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found");

    const pickupItem = pickup.items.find((item) => item.asset_id === asset.id);
    if (!pickupItem) throw new CustomizedError(httpStatus.BAD_REQUEST, "Asset not in this self-pickup");

    let scanQuantity = 1;
    if (asset.tracking_method === "BATCH") {
        if (!data.quantity || data.quantity < 1) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Quantity required for BATCH assets");
        }
        scanQuantity = data.quantity;
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
            scanned_by: user.id,
            scanned_at: new Date(),
        })
        .returning({ id: scanEvents.id });

    await insertScanEventAssets(scanEvent.id, [{ asset_id: asset.id, quantity: scanQuantity }]);

    if (asset.tracking_method === "BATCH") {
        await StockMovementService.record(null, {
            platformId, assetId: asset.id, familyId: (asset as any).family_id,
            delta: scanQuantity, movementType: "INBOUND",
            linkedEntityType: "SELF_PICKUP", linkedEntityId: selfPickupId,
            scanEventId: scanEvent.id, userId: user.id,
        });
    }

    await db.update(assets).set({ status: "AVAILABLE", last_scanned_at: new Date(), last_scanned_by: user.id }).where(eq(assets.id, asset.id));

    const allInbound = await db.query.scanEvents.findMany({
        where: and(eq(scanEvents.self_pickup_id, selfPickupId), eq(scanEvents.scan_type, "INBOUND")),
    });
    const totalScanned = allInbound.reduce((sum, s) => sum + s.quantity, 0);
    const totalRequired = pickup.items.reduce((sum, item) => sum + item.quantity, 0);

    return {
        asset: { asset_id: asset.id, asset_name: asset.name },
        progress: { total_items: totalRequired, items_scanned: totalScanned, percent_complete: Math.round((totalScanned / totalRequired) * 100) },
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
            items: { with: { asset: { columns: { id: true, name: true, tracking_method: true, available_quantity: true } } } },
            company: { columns: { name: true } },
        },
    });

    if (!pickup) throw new CustomizedError(httpStatus.NOT_FOUND, "Self-pickup not found");
    if (pickup.self_pickup_status !== "AWAITING_RETURN") {
        throw new CustomizedError(httpStatus.BAD_REQUEST, `Cannot complete return in status: ${pickup.self_pickup_status}`);
    }

    const inboundScans = await db.query.scanEvents.findMany({
        where: and(eq(scanEvents.self_pickup_id, selfPickupId), eq(scanEvents.scan_type, "INBOUND")),
    });

    // Pooled-aware reconciliation (same logic as order completeInboundScan)
    const unsettledLines: UnsettledPooledLine[] = [];
    const settlementsToApply: Array<{ item: (typeof pickup.items)[number]; settlement: PooledSettlementEntry; delta: number }> = [];

    for (const item of pickup.items) {
        const scannedQty = inboundScans.filter((s) => s.asset_id === item.asset_id).reduce((sum, s) => sum + s.quantity, 0);
        const trackingMethod = (item.asset as any)?.tracking_method || "INDIVIDUAL";
        const delta = scannedQty - item.quantity;

        if (trackingMethod === "INDIVIDUAL") {
            if (scannedQty < item.quantity) {
                throw new CustomizedError(httpStatus.BAD_REQUEST, `Cannot complete: ${item.asset_name}: ${scannedQty}/${item.quantity} scanned`);
            }
        } else if (delta < 0) {
            const matching = settlements.find((s) => s.line_id === item.id);
            if (!matching) {
                unsettledLines.push({ line_id: item.id, asset_id: item.asset_id, asset_name: item.asset_name, outbound_qty: item.quantity, scanned_qty: scannedQty, delta });
            } else {
                settlementsToApply.push({ item, settlement: matching, delta });
            }
        }
    }

    if (unsettledLines.length > 0) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Pooled items require settlement", { requires_settlement: unsettledLines } as any);
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
            tx, "SELF_PICKUP", selfPickupId, platformId, returnedByAsset
        );

        for (const { item, settlement, delta } of settlementsToApply) {
            await StockMovementService.record(tx, {
                platformId,
                assetId: item.asset_id,
                familyId: (item.asset as any)?.family_id || null,
                delta,
                movementType: "WRITE_OFF",
                writeOffReason: settlement.write_off_reason,
                note: settlement.note,
                linkedEntityType: "SELF_PICKUP",
                linkedEntityId: selfPickupId,
                userId: user.id,
            });

            await tx.update(selfPickupItems).set({ settled_at: new Date(), settled_by: user.id }).where(eq(selfPickupItems.id, item.id));
        }

        await tx.update(selfPickups).set({ self_pickup_status: "CLOSED", financial_status: "PENDING_INVOICE" }).where(eq(selfPickups.id, selfPickupId));
        await tx.insert(selfPickupStatusHistory).values({
            platform_id: platformId,
            self_pickup_id: selfPickupId,
            status: "CLOSED",
            notes: settlementsToApply.length > 0
                ? `Return completed with ${settlementsToApply.length} pooled settlement(s)`
                : "Return completed — all items returned and inspected",
            updated_by: user.id,
        });
    });

    await eventBus.emit({
        platform_id: platformId,
        event_type: "self_pickup.closed",
        entity_type: "SELF_PICKUP",
        entity_id: pickup.id,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            entity_id_readable: pickup.self_pickup_id,
            company_id: pickup.company_id,
            company_name: (pickup.company as any)?.name || "N/A",
            collector_name: pickup.collector_name,
            settlements_applied: settlementsToApply.length,
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
        where: and(eq(scanEvents.self_pickup_id, selfPickupId), eq(scanEvents.scan_type, "OUTBOUND")),
    });

    const assetsProgress = pickup.items.map((item) => {
        const scannedQty = outboundScans.filter((s) => s.asset_id === item.asset_id).reduce((sum, s) => sum + s.quantity, 0);
        return {
            asset_id: item.asset_id,
            asset_name: item.asset_name,
            qr_code: (item.asset as any)?.qr_code,
            tracking_method: (item.asset as any)?.tracking_method,
            required_quantity: item.quantity,
            scanned_quantity: scannedQty,
            is_complete: scannedQty >= item.quantity,
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
        where: and(eq(scanEvents.self_pickup_id, selfPickupId), eq(scanEvents.scan_type, "INBOUND")),
    });

    const assetsProgress = pickup.items.map((item) => {
        const scannedQty = inboundScans.filter((s) => s.asset_id === item.asset_id).reduce((sum, s) => sum + s.quantity, 0);
        return {
            asset_id: item.asset_id,
            asset_name: item.asset_name,
            qr_code: (item.asset as any)?.qr_code,
            tracking_method: (item.asset as any)?.tracking_method,
            required_quantity: item.quantity,
            scanned_quantity: scannedQty,
            is_complete: scannedQty >= item.quantity,
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

export const SelfPickupScanningServices = {
    selfPickupOutboundScan,
    completeSelfPickupHandover,
    selfPickupInboundScan,
    completeSelfPickupReturn,
    getSelfPickupHandoverProgress,
    getSelfPickupReturnProgress,
};
