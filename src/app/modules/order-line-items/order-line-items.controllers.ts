import { Request, Response } from "express";
import httpStatus from "http-status";
import { OrderLineItemsServices } from "./order-line-items.services";
import { getRequiredString } from "../../utils/request";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";

// ----------------------------------- GET LINE ITEMS -----------------------------------------
const getLineItems = catchAsync(async (req: Request, res: Response) => {
    const platformId = (req as any).platform_id;

    const items = await OrderLineItemsServices.getLineItems(platformId, req.query);

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

    const lineItem = await OrderLineItemsServices.createCatalogLineItem(payload);

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

    const lineItem = await OrderLineItemsServices.createCustomLineItem(payload);

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

    const lineItem = await OrderLineItemsServices.updateLineItem(
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

    const lineItem = await OrderLineItemsServices.voidLineItem(
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

export const OrderLineItemsControllers = {
    getLineItems,
    createCatalogLineItem,
    createCustomLineItem,
    updateLineItem,
    voidLineItem,
};
