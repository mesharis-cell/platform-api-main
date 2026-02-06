import { Request, Response } from "express";
import httpStatus from "http-status";
import { getRequiredString } from "../../utils/request";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { LineItemsServices } from "./order-line-items.services";

// ----------------------------------- GET LINE ITEMS -----------------------------------------
const getLineItems = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platformId;

    const items = await LineItemsServices.getLineItems(platformId, req.query);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Line items fetched successfully",
        data: items,
    });
});

// ----------------------------------- CREATE CATALOG LINE ITEM -----------------------------------
const createCatalogLineItem = catchAsync(async (req: Request, res: Response) => {
    // Extract user and platform ID from middleware
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const payload = {
        ...req.body,
        platform_id: platformId,
        added_by: user.id,
    };

    const lineItem = await LineItemsServices.createCatalogLineItem(payload);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Catalog line item added successfully",
        data: lineItem,
    });
});

// ----------------------------------- CREATE CUSTOM LINE ITEM -----------------------------------
const createCustomLineItem = catchAsync(async (req: Request, res: Response) => {
    // Extract user and platform ID from middleware
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const orderId = getRequiredString(req.params.orderId, "orderId");
    const payload = {
        ...req.body,
        platform_id: platformId,
        order_id: orderId,
        added_by: user.id,
    };

    const lineItem = await LineItemsServices.createCustomLineItem(payload);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Custom line item added successfully",
        data: lineItem,
    });
});

// ----------------------------------- UPDATE LINE ITEM -----------------------------------
const updateLineItem = catchAsync(async (req: Request, res: Response) => {
    // Extract platform ID from middleware
    const platformId = (req as any).platformId;
    const itemId = getRequiredString(req.params.itemId, "itemId");
    const payload = req.body;

    const lineItem = await LineItemsServices.updateLineItem(
        itemId,
        platformId,
        payload
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Line item updated successfully",
        data: lineItem,
    });
});

// ----------------------------------- VOID LINE ITEM -----------------------------------
const voidLineItem = catchAsync(async (req: Request, res: Response) => {
    // Extract user and platform ID from middleware
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const itemId = getRequiredString(req.params.itemId, "itemId");
    const payload = {
        ...req.body,
        voided_by: user.id,
    };

    const lineItem = await LineItemsServices.voidLineItem(
        itemId,
        platformId,
        payload
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Line item voided successfully",
        data: lineItem,
    });
});

export const LineItemsControllers = {
    getLineItems,
    createCatalogLineItem,
    createCustomLineItem,
    updateLineItem,
    voidLineItem,
};
