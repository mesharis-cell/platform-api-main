import { and, eq, inArray } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    assetConditionHistory,
    assets,
    orderItems,
    orderStatusHistory,
    orders,
    scanEventAssets,
    scanEventMedia,
    scanEvents,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import {
    CompleteInboundScanResponse,
    CompleteOutboundScanResponse,
    InboundScanPayload,
    InboundScanResponse,
    OrderProgressResponse,
    OutboundScanPayload,
    OutboundScanResponse,
    PooledSettlementEntry,
    ScanMediaPayload,
    UnsettledPooledLine,
} from "./scanning.interfaces";
import { eventBus, EVENT_TYPES } from "../../events";
import { releaseBookingsAndRestoreAvailability } from "../order/order.utils";
import { StockMovementService } from "../../services/stock-movement.service";

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

// ----------------------------------- INBOUND SCAN ---------------------------------------
const inboundScan = async (
    orderId: string,
    data: InboundScanPayload,
    user: AuthUser,
    platformId: string
): Promise<InboundScanResponse> => {
    const {
        qr_code,
        condition,
        notes,
        return_media,
        damage_media,
        refurb_days_estimate,
        discrepancy_reason,
        quantity,
    } = data;

    const normalizedReturnMedia = normalizeMediaEntries(return_media);
    const normalizedDamageMedia = normalizeMediaEntries(damage_media);

    // Step 1: Get order with items
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: true,
            items: {
                with: {
                    asset: true,
                },
            },
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 1b: Validate order status allows inbound scanning
    const INBOUND_ALLOWED_STATUSES = ["AWAITING_RETURN", "RETURN_IN_TRANSIT"];
    if (!INBOUND_ALLOWED_STATUSES.includes(order.order_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Inbound scanning not allowed in status: ${order.order_status}. Order must be in AWAITING_RETURN or RETURN_IN_TRANSIT.`
        );
    }

    // Step 2: Find asset by QR code
    const asset = await db.query.assets.findFirst({
        where: and(eq(assets.qr_code, qr_code), eq(assets.platform_id, platformId)),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Asset not found with this QR code");
    }

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

    // Step 3: Check if asset is in this order
    const orderItem = order.items.find((item) => item.asset_id === asset.id);

    if (!orderItem) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Asset not in this order");
    }

    // Step 4: Determine quantity to scan
    let scanQuantity = 1;
    if (asset.tracking_method === "BATCH") {
        if (!quantity || quantity < 1) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Quantity required for BATCH assets");
        }
        scanQuantity = quantity;
    }

    // Step 5: Get existing inbound scans for this asset
    const existingScans = await db.query.scanEvents.findMany({
        where: and(
            eq(scanEvents.order_id, orderId),
            eq(scanEvents.asset_id, asset.id),
            eq(scanEvents.scan_type, "INBOUND")
        ),
    });

    const alreadyScanned = existingScans.reduce((sum, scan) => sum + scan.quantity, 0);

    // Step 6: Validate not over-scanning
    if (alreadyScanned + scanQuantity > orderItem.quantity) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot scan ${scanQuantity} units. Already scanned: ${alreadyScanned}, Required: ${orderItem.quantity}`
        );
    }

    if (normalizedReturnMedia.length < 2) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "At least 2 wide return photos are required for inbound scans"
        );
    }

    if (condition !== "GREEN" && normalizedDamageMedia.length === 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "At least one damage report photo is required for damaged inbound items"
        );
    }

    // Step 7: Create scan event + media/assets
    const [scanEvent] = await db
        .insert(scanEvents)
        .values({
            order_id: orderId,
            asset_id: asset.id,
            scan_type: "INBOUND",
            quantity: scanQuantity,
            condition,
            notes: notes || null,
            discrepancy_reason: discrepancy_reason || null,
            metadata: {
                return_media_count: normalizedReturnMedia.length,
                damage_media_count: normalizedDamageMedia.length,
                refurb_days_estimate: refurb_days_estimate ?? null,
            },
            scanned_by: user.id,
            scanned_at: new Date(),
        })
        .returning({ id: scanEvents.id });

    await insertScanEventAssets(scanEvent.id, [{ asset_id: asset.id, quantity: scanQuantity }]);
    await insertScanEventMedia(scanEvent.id, normalizedReturnMedia, "RETURN_WIDE");
    await insertScanEventMedia(scanEvent.id, normalizedDamageMedia, "DAMAGE");

    // Audit: record inbound movement for BATCH items
    if (asset.tracking_method === "BATCH") {
        await StockMovementService.record(null, {
            platformId, assetId: asset.id, familyId: asset.family_id,
            delta: scanQuantity, movementType: "INBOUND",
            linkedEntityType: "ORDER", linkedEntityId: orderId,
            scanEventId: scanEvent.id, userId: user.id,
        });
    }

    // Step 8: Update asset condition if changed
    if (asset.condition !== condition) {
        const updateData: any = {
            condition,
            last_scanned_at: new Date(),
            last_scanned_by: user.id,
        };

        if (condition === "GREEN") {
            updateData.refurb_days_estimate = null; // Clear refurb when fixed
        } else if (refurb_days_estimate) {
            updateData.refurb_days_estimate = refurb_days_estimate;
        }

        await db.update(assets).set(updateData).where(eq(assets.id, asset.id));

        // Create condition history entry
        await db.insert(assetConditionHistory).values({
            platform_id: platformId,
            asset_id: asset.id,
            condition,
            notes: notes || null,
            photos: normalizedDamageMedia.map((entry) => entry.url),
            damage_report_entries: normalizedDamageMedia.map((entry) => ({
                url: entry.url,
                description: entry.note,
            })),
            updated_by: user.id,
        });
    } else {
        // Just update last scanned info
        await db
            .update(assets)
            .set({
                last_scanned_at: new Date(),
                last_scanned_by: user.id,
            })
            .where(eq(assets.id, asset.id));
    }

    // Step 9: Update latest return imagery and status.
    // NOTE: available_quantity is booking-driven and is not mutated by scans.
    const newStatus: "AVAILABLE" | "BOOKED" | "OUT" | "MAINTENANCE" = "AVAILABLE";

    await db
        .update(assets)
        .set({
            status: newStatus,
            images: normalizedReturnMedia.map((entry) => ({
                url: entry.url,
                note: entry.note,
            })),
        })
        .where(eq(assets.id, asset.id));

    // Step 10: Version snapshot after inbound scan
    const { AssetServices } = await import("../asset/assets.services");
    await AssetServices.createAssetVersionSnapshot(
        asset.id,
        platformId,
        "Inbound scan",
        user.id,
        orderId
    );

    // Step 10b: Get updated asset
    const updatedAsset = await db.query.assets.findFirst({
        where: eq(assets.id, asset.id),
    });

    // Step 11: Calculate new progress
    const allInboundScans = await db.query.scanEvents.findMany({
        where: and(eq(scanEvents.order_id, orderId), eq(scanEvents.scan_type, "INBOUND")),
    });

    const totalScanned = allInboundScans.reduce((sum, scan) => sum + scan.quantity, 0);
    const totalRequired = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const percentComplete = Math.round((totalScanned / totalRequired) * 100);

    return {
        message: "Item scanned in successfully",
        asset: updatedAsset,
        progress: {
            items_scanned: totalScanned,
            total_items: totalRequired,
            percent_complete: percentComplete,
        },
    };
};

// ----------------------------------- GET INBOUND PROGRESS -----------------------------------
const getInboundProgress = async (
    orderId: string,
    user: AuthUser,
    platformId: string
): Promise<OrderProgressResponse> => {
    // Step 1: Get order with items
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: true,
            items: {
                with: {
                    asset: true,
                },
            },
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Get all inbound scan events for this order
    const inboundScans = await db.query.scanEvents.findMany({
        where: and(eq(scanEvents.order_id, orderId), eq(scanEvents.scan_type, "INBOUND")),
    });

    // Step 3: Calculate progress for each asset
    const assetsProgress = order.items.map((item) => {
        const scannedQuantity = inboundScans
            .filter((scan) => scan.asset_id === item.asset_id)
            .reduce((sum, scan) => sum + scan.quantity, 0);

        return {
            asset_id: item.asset_id,
            asset_name: item.asset_name,
            qr_code: (item.asset as any).qr_code,
            tracking_method: (item.asset as any).tracking_method,
            required_quantity: item.quantity,
            scanned_quantity: scannedQuantity,
            is_complete: scannedQuantity >= item.quantity,
        };
    });

    // Step 4: Calculate overall progress
    const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const scannedItems = assetsProgress.reduce((sum, asset) => sum + asset.scanned_quantity, 0);
    const percentComplete = totalItems > 0 ? Math.round((scannedItems / totalItems) * 100) : 0;

    return {
        order_id: order.order_id,
        order_status: order.order_status,
        total_items: totalItems,
        items_scanned: scannedItems,
        percent_complete: percentComplete,
        assets: assetsProgress,
    };
};

// ----------------------------------- COMPLETE INBOUND SCAN ----------------------------------
// Pooled-aware: serialized items require full scan; pooled (BATCH) items support partial
// return via optional settlements[] body. If pooled deltas exist without matching
// settlements, returns 400 with requires_settlement list so frontend can show modal.
const completeInboundScan = async (
    orderId: string,
    user: AuthUser,
    platformId: string,
    settlements: PooledSettlementEntry[] = []
): Promise<CompleteInboundScanResponse> => {
    // Step 1: Get order with items + asset tracking method
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: { columns: { name: true } },
            items: {
                with: {
                    asset: {
                        columns: {
                            id: true,
                            name: true,
                            tracking_method: true,
                            refurb_days_estimate: true,
                            available_quantity: true,
                        },
                    },
                },
            },
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Validate order status
    if (!["AWAITING_RETURN", "RETURN_IN_TRANSIT"].includes(order.order_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot complete inbound scan. Order status must be AWAITING_RETURN or RETURN_IN_TRANSIT, current: ${order.order_status}`
        );
    }

    // Step 3: Get all inbound scan events
    const inboundScans = await db.query.scanEvents.findMany({
        where: and(eq(scanEvents.order_id, orderId), eq(scanEvents.scan_type, "INBOUND")),
    });

    // Step 4: Pooled-aware per-item reconciliation
    const unsettledLines: UnsettledPooledLine[] = [];
    const settlementsToApply: Array<{
        item: (typeof order.items)[number];
        settlement: PooledSettlementEntry;
        delta: number;
    }> = [];

    for (const item of order.items) {
        const scannedQuantity = inboundScans
            .filter((scan) => scan.asset_id === item.asset_id)
            .reduce((sum, scan) => sum + scan.quantity, 0);

        const trackingMethod = (item.asset as any)?.tracking_method || "INDIVIDUAL";
        const delta = scannedQuantity - item.quantity; // negative = shortfall

        if (trackingMethod === "INDIVIDUAL") {
            // Serialized items: strict — must scan every unit
            if (scannedQuantity < item.quantity) {
                throw new CustomizedError(
                    httpStatus.BAD_REQUEST,
                    `Cannot complete scan. ${item.asset_name}: ${scannedQuantity}/${item.quantity} scanned`
                );
            }
        } else {
            // Pooled (BATCH) items: shortfall is OK if settled
            if (delta < 0) {
                const matching = settlements.find((s) => s.line_id === item.id);
                if (!matching) {
                    unsettledLines.push({
                        line_id: item.id,
                        asset_id: item.asset_id,
                        asset_name: item.asset_name,
                        outbound_qty: item.quantity,
                        scanned_qty: scannedQuantity,
                        delta,
                    });
                } else {
                    settlementsToApply.push({ item, settlement: matching, delta });
                }
            }
            // delta >= 0 means fully returned or over-returned — no settlement needed
        }
    }

    // If any pooled lines have unresolved shortfalls, return them for frontend settlement modal
    if (unsettledLines.length > 0) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Pooled items require settlement", {
            requires_settlement: unsettledLines,
        } as any);
    }

    // Build returnedByAsset map for net restore
    const returnedByAsset = new Map<string, number>();
    for (const item of order.items) {
        const scannedQty = inboundScans
            .filter((s) => s.asset_id === item.asset_id)
            .reduce((sum, s) => sum + s.quantity, 0);
        returnedByAsset.set(item.asset_id, scannedQty);
    }

    await db.transaction(async (tx) => {
        // Step 5: Release bookings with NET restore (only what actually came back)
        await releaseBookingsAndRestoreAvailability(
            tx, "ORDER", orderId, platformId, returnedByAsset
        );

        // Step 6: Apply write-offs via StockMovementService + mark settled
        for (const { item, settlement, delta } of settlementsToApply) {
            await StockMovementService.record(tx, {
                platformId,
                assetId: item.asset_id,
                familyId: (item.asset as any)?.family_id || null,
                delta,
                movementType: "WRITE_OFF",
                writeOffReason: settlement.write_off_reason,
                note: settlement.note,
                linkedEntityType: "ORDER",
                linkedEntityId: orderId,
                userId: user.id,
            });

            await tx
                .update(orderItems)
                .set({
                    settled_at: new Date(),
                    settled_by: user.id,
                })
                .where(eq(orderItems.id, item.id));
        }

        // Step 7: Update order status to CLOSED
        await tx
            .update(orders)
            .set({
                order_status: "CLOSED",
                financial_status: "PENDING_INVOICE",
            })
            .where(eq(orders.id, orderId));

        // Step 8: Create status history entry
        await tx.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "CLOSED",
            notes:
                settlementsToApply.length > 0
                    ? `Inbound scanning completed with ${settlementsToApply.length} pooled settlement(s)`
                    : "Inbound scanning completed - all items returned and inspected",
            updated_by: user.id,
        });
    });

    // Step 9: Emit order.closed event
    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.ORDER_CLOSED,
        entity_type: "ORDER",
        entity_id: order.id,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            entity_id_readable: order.order_id,
            company_id: order.company_id,
            company_name: (order.company as any)?.name || "N/A",
            contact_name: order.contact_name,
            event_start_date: order.event_start_date?.toISOString().split("T")[0] || "",
            event_end_date: order.event_end_date?.toISOString().split("T")[0] || "",
            order_url: "",
            settlements_applied: settlementsToApply.length,
        },
    });

    return {
        message: "Inbound scan completed successfully",
        order_id: order.order_id,
        new_status: "CLOSED",
    };
};

// ================================= OUTBOUND SCANNING =================================

// ----------------------------------- OUTBOUND SCAN ---------------------------------------
const outboundScan = async (
    orderId: string,
    data: OutboundScanPayload,
    user: AuthUser,
    platformId: string
): Promise<OutboundScanResponse> => {
    const { qr_code, quantity, note } = data;

    // Step 1: Get order with items
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            items: true,
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Validate order status
    if (order.order_status !== "IN_PREPARATION") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Order must be in IN_PREPARATION status. Current status: ${order.order_status}`
        );
    }

    // Step 3: Find asset by QR code
    const asset = await db.query.assets.findFirst({
        where: and(eq(assets.qr_code, qr_code), eq(assets.platform_id, platformId)),
    });

    if (!asset) {
        throw new CustomizedError(httpStatus.NOT_FOUND, `Asset not found with QR code: ${qr_code}`);
    }

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
                success: false,
                asset: {
                    asset_id: asset.id,
                    asset_name: asset.name,
                    tracking_method: asset.tracking_method,
                    scanned_quantity: 0,
                    required_quantity: 0,
                    remaining_quantity: 0,
                },
                redirect_asset: {
                    id: newAsset.id,
                    name: newAsset.name,
                    qr_code: newAsset.qr_code,
                },
            };
        }
    }

    // Step 4: Check if asset is in this order
    const orderItem = order.items.find((item) => item.asset_id === asset.id);

    if (!orderItem) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Asset is not in this order");
    }

    // Step 5: Determine quantity to scan
    let scanQuantity = 1;
    if (asset.tracking_method === "BATCH") {
        if (!quantity || quantity < 1) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Quantity required for BATCH assets");
        }
        scanQuantity = quantity;
    }

    // Step 6: Get existing outbound scans for this asset
    const existingScans = await db.query.scanEvents.findMany({
        where: and(
            eq(scanEvents.order_id, orderId),
            eq(scanEvents.asset_id, asset.id),
            eq(scanEvents.scan_type, "OUTBOUND")
        ),
    });

    const alreadyScanned = existingScans.reduce((sum, scan) => sum + scan.quantity, 0);

    // Step 7: Validate not over-scanning
    if (alreadyScanned >= orderItem.quantity) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "All units of this asset have already been scanned"
        );
    }

    if (alreadyScanned + scanQuantity > orderItem.quantity) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot scan ${scanQuantity} units. Already scanned: ${alreadyScanned}, Required: ${orderItem.quantity}`
        );
    }

    // Step 8: Create scan event
    const [scanEvent] = await db
        .insert(scanEvents)
        .values({
            order_id: orderId,
            asset_id: asset.id,
            scan_type: "OUTBOUND",
            quantity: scanQuantity,
            condition: "GREEN", // Default for outbound
            notes: note || null,
            discrepancy_reason: null,
            metadata: {},
            scanned_by: user.id,
            scanned_at: new Date(),
        })
        .returning({ id: scanEvents.id });

    await insertScanEventAssets(scanEvent.id, [{ asset_id: asset.id, quantity: scanQuantity }]);

    // Audit: record outbound movement for BATCH items
    if (asset.tracking_method === "BATCH") {
        await StockMovementService.record(null, {
            platformId, assetId: asset.id, familyId: asset.family_id,
            delta: -scanQuantity, movementType: "OUTBOUND",
            linkedEntityType: "ORDER", linkedEntityId: orderId,
            scanEventId: scanEvent.id, userId: user.id,
        });
    }

    // Step 9: Mark asset as physically out.
    // NOTE: available_quantity is booking-driven and is not mutated by scans.
    await db
        .update(assets)
        .set({
            status: "OUT",
            last_scanned_at: new Date(),
            last_scanned_by: user.id,
        })
        .where(eq(assets.id, asset.id));

    // Step 10: Calculate progress
    const newScannedTotal = alreadyScanned + scanQuantity;

    const allOutboundScans = await db.query.scanEvents.findMany({
        where: and(eq(scanEvents.order_id, orderId), eq(scanEvents.scan_type, "OUTBOUND")),
    });

    const totalScanned = allOutboundScans.reduce((sum, scan) => sum + scan.quantity, 0);
    const totalRequired = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const percentComplete = Math.round((totalScanned / totalRequired) * 100);

    return {
        success: true,
        asset: {
            asset_id: asset.id,
            asset_name: asset.name,
            tracking_method: asset.tracking_method,
            scanned_quantity: newScannedTotal,
            required_quantity: orderItem.quantity,
            remaining_quantity: orderItem.quantity - newScannedTotal,
        },
        progress: {
            total_items: totalRequired,
            items_scanned: totalScanned,
            percent_complete: percentComplete,
        },
    };
};

// ----------------------------------- COMPLETE OUTBOUND SCAN ----------------------------------
const completeOutboundScan = async (
    orderId: string,
    user: AuthUser,
    platformId: string
): Promise<CompleteOutboundScanResponse> => {
    // Step 1: Get order with items
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: true,
            items: true,
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Validate order status
    if (order.order_status !== "IN_PREPARATION") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot complete outbound scan. Order status must be IN_PREPARATION, current: ${order.order_status}`
        );
    }

    // Step 3: Get all outbound scan events
    const outboundScans = await db.query.scanEvents.findMany({
        where: and(eq(scanEvents.order_id, orderId), eq(scanEvents.scan_type, "OUTBOUND")),
    });

    // Step 4: Validate all items scanned
    const totalRequired = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalScanned = outboundScans.reduce((sum, scan) => sum + scan.quantity, 0);

    if (totalScanned < totalRequired) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Not all items scanned. Scanned: ${totalScanned}, Required: ${totalRequired}`
        );
    }

    await db.transaction(async (tx) => {
        // Step 5: Update order status to READY_FOR_DELIVERY
        await tx
            .update(orders)
            .set({
                order_status: "READY_FOR_DELIVERY",
            })
            .where(eq(orders.id, orderId));

        // Step 6: Create status history entry
        await tx.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "READY_FOR_DELIVERY",
            notes: "All items scanned out and ready for delivery",
            updated_by: user.id,
        });

        // Step 7: Update asset status to OUT
        const assetIds = order.items.map((i) => i.asset_id);

        await tx
            .update(assets)
            .set({
                status: "OUT",
            })
            .where(inArray(assets.id, assetIds));
    });

    // Step 8: Emit order.ready_for_delivery event
    await eventBus.emit({
        platform_id: platformId,
        event_type: EVENT_TYPES.ORDER_READY_FOR_DELIVERY,
        entity_type: "ORDER",
        entity_id: order.id,
        actor_id: user.id,
        actor_role: user.role,
        payload: {
            entity_id_readable: order.order_id,
            company_id: order.company_id,
            company_name: (order.company as any)?.name || "N/A",
            venue_name: order.venue_name,
            delivery_window: order.delivery_window || "",
            order_url: "",
        },
    });

    return {
        message: "Outbound scan completed successfully",
        order_id: order.order_id,
        new_status: "READY_FOR_DELIVERY",
    };
};

// ----------------------------------- GET OUTBOUND PROGRESS -----------------------------------
const getOutboundProgress = async (
    orderId: string,
    user: AuthUser,
    platformId: string
): Promise<OrderProgressResponse> => {
    // Step 1: Get order with items
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            company: true,
            items: {
                with: {
                    asset: true,
                },
            },
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Get all outbound scan events for this order
    const outboundScans = await db.query.scanEvents.findMany({
        where: and(eq(scanEvents.order_id, orderId), eq(scanEvents.scan_type, "OUTBOUND")),
    });

    // Step 3: Calculate progress for each asset
    const assetsProgress = order.items.map((item) => {
        const scannedQuantity = outboundScans
            .filter((scan) => scan.asset_id === item.asset_id)
            .reduce((sum, scan) => sum + scan.quantity, 0);

        return {
            asset_id: item.asset_id,
            asset_name: item.asset_name,
            qr_code: (item.asset as any).qr_code,
            tracking_method: (item.asset as any).tracking_method,
            required_quantity: item.quantity,
            scanned_quantity: scannedQuantity,
            is_complete: scannedQuantity >= item.quantity,
        };
    });

    // Step 4: Calculate overall progress
    const totalItems = order.items.reduce((sum, item) => sum + item.quantity, 0);
    const scannedItems = assetsProgress.reduce((sum, asset) => sum + asset.scanned_quantity, 0);
    const percentComplete = totalItems > 0 ? Math.round((scannedItems / totalItems) * 100) : 0;

    return {
        order_id: order.order_id,
        order_status: order.order_status,
        total_items: totalItems,
        items_scanned: scannedItems,
        percent_complete: percentComplete,
        assets: assetsProgress,
    };
};

// ----------------------------------- UPLOAD TRUCK PHOTOS -------------------------------------
const uploadTruckPhotos = async (
    orderId: string,
    media: ScanMediaPayload[],
    assetIds: string[],
    note: string | undefined,
    user: AuthUser,
    platformId: string,
    tripPhase: "OUTBOUND" | "RETURN" = "OUTBOUND"
) => {
    // Step 1: Get order
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
        with: {
            items: {
                columns: {
                    asset_id: true,
                    quantity: true,
                },
            },
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    if (
        tripPhase === "OUTBOUND" &&
        !["IN_PREPARATION", "READY_FOR_DELIVERY"].includes(order.order_status)
    ) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Outbound truck photos are not allowed in the current order status"
        );
    }

    if (
        tripPhase === "RETURN" &&
        !["AWAITING_RETURN", "RETURN_IN_TRANSIT"].includes(order.order_status)
    ) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Return truck photos are not allowed in the current order status"
        );
    }

    const normalizedMedia = normalizeMediaEntries(media);
    if (normalizedMedia.length === 0) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "At least one photo is required");
    }

    const orderAssetMap = new Map(order.items.map((item) => [item.asset_id, item.quantity]));
    const selectedAssetIds = (assetIds || []).filter((id) => id && id.trim().length > 0);

    if (selectedAssetIds.length > 0) {
        const invalid = selectedAssetIds.filter((id) => !orderAssetMap.has(id));
        if (invalid.length > 0) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Selected asset_ids are not part of this order: ${invalid.join(", ")}`
            );
        }
    }

    const resolvedAssetIds =
        selectedAssetIds.length > 0 ? selectedAssetIds : Array.from(orderAssetMap.keys());

    const [scanEvent] = await db
        .insert(scanEvents)
        .values({
            order_id: orderId,
            asset_id: null,
            scan_type: tripPhase === "OUTBOUND" ? "OUTBOUND_TRUCK_PHOTOS" : "RETURN_TRUCK_PHOTOS",
            quantity: 0,
            condition: null,
            notes: note || null,
            discrepancy_reason: null,
            metadata: { trip_phase: tripPhase },
            scanned_by: user.id,
            scanned_at: new Date(),
        })
        .returning({ id: scanEvents.id });

    await insertScanEventAssets(
        scanEvent.id,
        resolvedAssetIds.map((assetId) => ({
            asset_id: assetId,
            quantity: orderAssetMap.get(assetId) ?? 0,
        }))
    );

    await insertScanEventMedia(
        scanEvent.id,
        normalizedMedia,
        tripPhase === "OUTBOUND" ? "TRUCK_OUTBOUND" : "TRUCK_RETURN"
    );

    return {
        order_id: order.order_id,
        photos_count: normalizedMedia.length,
        trip_phase: tripPhase,
    };
};

export const ScanningServices = {
    inboundScan,
    getInboundProgress,
    completeInboundScan,
    outboundScan,
    completeOutboundScan,
    getOutboundProgress,
    uploadTruckPhotos,
};
