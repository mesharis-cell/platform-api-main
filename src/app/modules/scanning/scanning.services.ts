import { and, eq, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { assetConditionHistory, assets, orders, scanEvents } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { InboundScanPayload, InboundScanResponse } from "./scanning.interfaces";

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

    // Step 2: Check user has scanning permission
    if (user.role !== 'ADMIN' && user.role !== 'LOGISTICS') {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Only warehouse staff can scan items"
        );
    }

    // Step 3: Find asset by QR code
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

    // Step 4: Check if asset is in this order
    const orderItem = order.items.find((item) => item.asset_id === asset.id);

    if (!orderItem) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Asset not in this order"
        );
    }

    // Step 5: Determine quantity to scan
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

    // Step 6: Get existing inbound scans for this asset
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

    // Step 7: Validate not over-scanning
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
        scan_type: 'INBOUND',
        quantity: scanQuantity,
        condition,
        notes: notes || null,
        photos: photos || [],
        discrepancy_reason: discrepancy_reason || null,
        scanned_by: user.id,
        scanned_at: new Date(),
    });

    // Step 9: Update asset condition if changed
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

    // Step 10: Update asset quantities (move items back to AVAILABLE)
    const newStatus: 'AVAILABLE' | 'BOOKED' | 'OUT' | 'MAINTENANCE' = 'AVAILABLE';

    await db
        .update(assets)
        .set({
            available_quantity: sql`${assets.available_quantity} + ${scanQuantity}`,
            status: newStatus,
        })
        .where(eq(assets.id, asset.id));

    // Step 11: Get updated asset
    const updatedAsset = await db.query.assets.findFirst({
        where: eq(assets.id, asset.id),
    });

    // Step 12: Calculate new progress
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

export const ScanningServices = {
    inboundScan,
};
