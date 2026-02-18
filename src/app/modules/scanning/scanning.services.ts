import { and, eq, inArray, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    assetBookings,
    assetConditionHistory,
    assets,
    orderStatusHistory,
    orders,
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
} from "./scanning.interfaces";
import { invoiceGenerator } from "../../utils/invoice";
import { eventBus, EVENT_TYPES } from "../../events";
import config from "../../config";

type DamageReportEntry = {
    url: string;
    description?: string;
};

const normalizeDamageReportEntries = (
    entries?: Array<{ url: string; description?: string }>,
    legacyPhotos?: string[]
): DamageReportEntry[] => {
    const normalized = new Map<string, string | undefined>();

    (entries || []).forEach((entry) => {
        const url = entry.url?.trim();
        if (!url) return;
        const description = entry.description?.trim();
        normalized.set(url, description && description.length > 0 ? description : undefined);
    });

    (legacyPhotos || []).forEach((photoUrl) => {
        const url = photoUrl?.trim();
        if (!url || normalized.has(url)) return;
        normalized.set(url, undefined);
    });

    return Array.from(normalized.entries()).map(([url, description]) => ({ url, description }));
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
        latest_return_images,
        damage_report_entries,
        damage_report_photos,
        refurb_days_estimate,
        discrepancy_reason,
        quantity,
    } = data;

    const normalizedDamageEntries = normalizeDamageReportEntries(
        damage_report_entries,
        damage_report_photos
    );
    const normalizedDamagePhotos = normalizedDamageEntries.map((entry) => entry.url);

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

    if (!latest_return_images || latest_return_images.length < 2) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "At least 2 wide return photos are required for inbound scans"
        );
    }

    if (condition !== "GREEN" && normalizedDamageEntries.length === 0) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "At least one damage report photo is required for damaged inbound items"
        );
    }

    // Step 7: Create scan event
    await db.insert(scanEvents).values({
        order_id: orderId,
        asset_id: asset.id,
        scan_type: "INBOUND",
        quantity: scanQuantity,
        condition,
        notes: notes || null,
        photos: normalizedDamagePhotos,
        latest_return_images: latest_return_images || [],
        damage_report_photos: normalizedDamagePhotos,
        damage_report_entries: normalizedDamageEntries,
        discrepancy_reason: discrepancy_reason || null,
        scanned_by: user.id,
        scanned_at: new Date(),
    });

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
            photos: normalizedDamagePhotos,
            damage_report_entries: normalizedDamageEntries,
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

    // Step 9: Update inventory counts and latest return imagery.
    const newStatus: "AVAILABLE" | "BOOKED" | "OUT" | "MAINTENANCE" = "AVAILABLE";

    await db
        .update(assets)
        .set({
            available_quantity: sql`${assets.available_quantity} + ${scanQuantity}`,
            status: newStatus,
            images: latest_return_images,
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
const completeInboundScan = async (
    orderId: string,
    user: AuthUser,
    platformId: string
): Promise<CompleteInboundScanResponse> => {
    // Step 1: Get order with items
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

    // Step 4: Validate all items scanned
    for (const item of order.items) {
        const scannedQuantity = inboundScans
            .filter((scan) => scan.asset_id === item.asset_id)
            .reduce((sum, scan) => sum + scan.quantity, 0);

        if (scannedQuantity < item.quantity) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Cannot complete scan. ${item.asset_name}: ${scannedQuantity}/${item.quantity} scanned`
            );
        }
    }

    await db.transaction(async (tx) => {
        // Step 5: Release asset bookings (delete bookings to free up assets)
        await tx.delete(assetBookings).where(eq(assetBookings.order_id, orderId));

        // Step 6: Update order status to CLOSED
        await tx
            .update(orders)
            .set({
                order_status: "CLOSED",
                financial_status: "PENDING_INVOICE",
            })
            .where(eq(orders.id, orderId));

        // Step 7: Create status history entry
        await tx.insert(orderStatusHistory).values({
            platform_id: platformId,
            order_id: orderId,
            status: "CLOSED",
            notes: "Inbound scanning completed - all items returned and inspected",
            updated_by: user.id,
        });

        // Note: available_quantity is already incremented per-scan in inboundScan
        // We only need to ensure status is AVAILABLE (already set during inbound scans)
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
            order_url: `${config.client_url}/orders/${order.order_id}`,
        },
    });

    const { invoice_id } = await invoiceGenerator(orderId, platformId, false, user);

    if (invoice_id) {
        await eventBus.emit({
            platform_id: platformId,
            event_type: EVENT_TYPES.INVOICE_GENERATED,
            entity_type: "ORDER",
            entity_id: order.id,
            actor_id: user.id,
            actor_role: user.role,
            payload: {
                entity_id_readable: order.order_id,
                company_id: order.company_id,
                company_name: (order.company as any)?.name || "N/A",
                invoice_number: invoice_id,
                final_total: "0",
                download_url: `${config.server_url}/client/v1/invoice/download-pdf/${invoice_id}?pid=${platformId}`,
                order_url: `${config.client_url}/orders/${order.order_id}`,
            },
        });
    }

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
    const { qr_code, quantity } = data;

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
    await db.insert(scanEvents).values({
        order_id: orderId,
        asset_id: asset.id,
        scan_type: "OUTBOUND",
        quantity: scanQuantity,
        condition: "GREEN", // Default for outbound
        notes: null,
        photos: [],
        discrepancy_reason: null,
        scanned_by: user.id,
        scanned_at: new Date(),
    });

    // Step 9: Update asset quantities
    // When items go out: decrease available_quantity
    await db
        .update(assets)
        .set({
            available_quantity: sql`${assets.available_quantity} - ${scanQuantity}`,
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
            order_url: `${config.client_url}/orders/${order.order_id}`,
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
    photos: string[],
    user: AuthUser,
    platformId: string
) => {
    // Step 1: Get order
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, orderId), eq(orders.platform_id, platformId)),
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Validate order status (should be during outbound scanning)
    if (!["IN_PREPARATION", "READY_FOR_DELIVERY"].includes(order.order_status)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Truck photos can only be uploaded during outbound scanning"
        );
    }

    // Step 3: Store photos in order metadata or create a separate record
    // For now, we'll update the order with truck_photos field
    await db
        .update(orders)
        .set({
            truck_photos: photos,
            updated_at: new Date(),
        })
        .where(eq(orders.id, orderId));

    return {
        order_id: order.order_id,
        photos_count: photos.length,
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
