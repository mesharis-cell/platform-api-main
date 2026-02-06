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
    const { platform_id, user } = req as any;
    const payload = {
        ...req.body,
        platform_id,
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
const createCustomLineItem = async (req: Request, res: Response) => {
    const { platform_id, user } = req as any;
    const orderId = getRequiredString(req.params.orderId, "orderId");
    const payload = {
        ...req.body,
        platform_id,
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
};

// ----------------------------------- UPDATE LINE ITEM -----------------------------------
const updateLineItem = async (req: Request, res: Response) => {
    const { platform_id } = req as any;
    const orderId = getRequiredString(req.params.orderId, "orderId");
    const itemId = getRequiredString(req.params.itemId, "itemId");
    const payload = req.body;

    const lineItem = await OrderLineItemsServices.updateLineItem(
        itemId,
        orderId,
        platform_id,
        payload
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Line item updated successfully",
        data: lineItem,
    });
};

// ----------------------------------- VOID LINE ITEM -----------------------------------
const voidLineItem = async (req: Request, res: Response) => {
    const { platform_id, user } = req as any;
    const orderId = getRequiredString(req.params.orderId, "orderId");
    const itemId = getRequiredString(req.params.itemId, "itemId");
    const payload = {
        ...req.body,
        voided_by: user.id,
    };

    const lineItem = await OrderLineItemsServices.voidLineItem(
        itemId,
        orderId,
        platform_id,
        payload
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Line item voided successfully",
        data: lineItem,
    });
};

export const OrderLineItemsControllers = {
    getLineItems,
    createCatalogLineItem,
    createCustomLineItem,
    updateLineItem,
    voidLineItem,
};
