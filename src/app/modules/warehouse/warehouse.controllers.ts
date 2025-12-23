import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { WarehouseServices } from "./warehouse.services";

// ----------------------------------- CREATE WAREHOUSE -----------------------------------
const createWarehouse = catchAsync(async (req, res) => {
    // Extract platform ID from middleware
    const platformId = (req as any).platformId;

    // Merge platform ID with request body
    const warehouseData = {
        ...req.body,
        platform_id: platformId,
    };

    const result = await WarehouseServices.createWarehouse(warehouseData);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Warehouse created successfully",
        data: result,
    });
});

// ----------------------------------- GET WAREHOUSES -------------------------------------
const getWarehouses = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;

    const result = await WarehouseServices.getWarehouses(req.query, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Warehouses fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// ----------------------------------- GET WAREHOUSE BY ID --------------------------------
const getWarehouseById = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await WarehouseServices.getWarehouseById(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Warehouse fetched successfully",
        data: result,
    });
});

// ----------------------------------- UPDATE WAREHOUSE ---------------------------------------
const updateWarehouse = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await WarehouseServices.updateWarehouse(id, req.body, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Warehouse updated successfully",
        data: result,
    });
});

// ----------------------------------- DELETE WAREHOUSE ---------------------------------------
const deleteWarehouse = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await WarehouseServices.deleteWarehouse(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Warehouse deleted successfully",
        data: result,
    });
});

export const WarehouseControllers = {
    createWarehouse,
    getWarehouses,
    getWarehouseById,
    updateWarehouse,
    deleteWarehouse,
};
