import { and, eq, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { assetConditionHistory, assets, orders, scanEvents } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { InboundScanPayload, InboundScanResponse, OrderProgressResponse } from "./scanning.interfaces";

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
        photos,
        refurb_days_estimate,
        discrepancy_reason,
        quantity,
    } = data;

    // Step 1: Get order with items
    const order = await db.query.orders.findFirst({
        where: and(
            eq(orders.id, orderId),
            eq(orders.platform_id, platformId)
        ),
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

    // Step 2: Find asset by QR code
    const asset = await db.query.assets.findFirst({
        where: and(
            eq(assets.qr_code, qr_code),
            eq(assets.platform_id, platformId)
        ),
    });

    if (!asset) {
        throw new CustomizedError(
            httpStatus.NOT_FOUND,
            "Asset not found with this QR code"
        );
    }

    // Step 3: Check if asset is in this order
    const orderItem = order.items.find((item) => item.asset_id === asset.id);

    if (!orderItem) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Asset not in this order"
        );
    }

    // Step 4: Determine quantity to scan
    let scanQuantity = 1;
    if (asset.tracking_method === 'BATCH') {
        if (!quantity || quantity < 1) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Quantity required for BATCH assets"
            );
        }
        scanQuantity = quantity;
    }

    // Step 5: Get existing inbound scans for this asset
    const existingScans = await db.query.scanEvents.findMany({
        where: and(
            eq(scanEvents.order_id, orderId),
            eq(scanEvents.asset_id, asset.id),
            eq(scanEvents.scan_type, 'INBOUND')
        ),
    });

    const alreadyScanned = existingScans.reduce(
        (sum, scan) => sum + scan.quantity,
        0
    );

    // Step 6: Validate not over-scanning
    if (alreadyScanned + scanQuantity > orderItem.quantity) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Cannot scan ${scanQuantity} units. Already scanned: ${alreadyScanned}, Required: ${orderItem.quantity}`
        );
    }

    // Step 7: Create scan event
    await db.insert(scanEvents).values({
        order_id: orderId,
        asset_id: asset.id,
        scan_type: 'INBOUND',
        quantity: scanQuantity,
        condition,
        notes: notes || null,
        photos: photos || [],
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

        if (condition === 'GREEN') {
            updateData.refurb_days_estimate = null; // Clear refurb when fixed
        } else if (refurb_days_estimate) {
            updateData.refurb_days_estimate = refurb_days_estimate;
        }

        await db
            .update(assets)
            .set(updateData)
            .where(eq(assets.id, asset.id));

        // Create condition history entry
        await db.insert(assetConditionHistory).values({
            platform_id: platformId,
            asset_id: asset.id,
            condition,
            notes: notes || null,
            photos: photos || [],
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

    // Step 9: Update asset quantities (move items back to AVAILABLE)
    const newStatus: 'AVAILABLE' | 'BOOKED' | 'OUT' | 'MAINTENANCE' = 'AVAILABLE';

    await db
        .update(assets)
        .set({
            available_quantity: sql`${assets.available_quantity} + ${scanQuantity}`,
            status: newStatus,
        })
        .where(eq(assets.id, asset.id));

    // Step 10: Get updated asset
    const updatedAsset = await db.query.assets.findFirst({
        where: eq(assets.id, asset.id),
    });

    // Step 11: Calculate new progress
    const allInboundScans = await db.query.scanEvents.findMany({
        where: and(
            eq(scanEvents.order_id, orderId),
            eq(scanEvents.scan_type, 'INBOUND')
        ),
    });

    const totalScanned = allInboundScans.reduce(
        (sum, scan) => sum + scan.quantity,
        0
    );
    const totalRequired = order.items.reduce(
        (sum, item) => sum + item.quantity,
        0
    );
    const percentComplete = Math.round((totalScanned / totalRequired) * 100);

    return {
        message: 'Item scanned in successfully',
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
        where: and(
            eq(orders.id, orderId),
            eq(orders.platform_id, platformId)
        ),
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
        where: and(
            eq(scanEvents.order_id, orderId),
            eq(scanEvents.scan_type, 'INBOUND')
        ),
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
    const scannedItems = assetsProgress.reduce(
        (sum, asset) => sum + asset.scanned_quantity,
        0
    );
    const percentComplete =
        totalItems > 0 ? Math.round((scannedItems / totalItems) * 100) : 0;

    return {
        order_id: order.order_id,
        order_status: order.order_status,
        total_items: totalItems,
        items_scanned: scannedItems,
        percent_complete: percentComplete,
        assets: assetsProgress,
    };
};

export const ScanningServices = {
    inboundScan,
    getInboundProgress,
};
