import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { ZoneServices } from "./zone.services";

// ----------------------------------- CREATE ZONE -----------------------------------
const createZone = catchAsync(async (req, res) => {
    // Extract platform ID from middleware
    const platformId = (req as any).platformId;

    // Merge platform ID with request body
    const zoneData = {
        ...req.body,
        platform_id: platformId,
    };

    const result = await ZoneServices.createZone(zoneData);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Zone created successfully",
        data: result,
    });
});

// ----------------------------------- GET ZONES -------------------------------------
const getZones = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await ZoneServices.getZones(req.query, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Zones fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// ----------------------------------- GET ZONE BY ID --------------------------------
const getZoneById = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await ZoneServices.getZoneById(id as string, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Zone fetched successfully",
        data: result,
    });
});

// ----------------------------------- UPDATE ZONE ---------------------------------------
const updateZone = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await ZoneServices.updateZone(id as string, req.body, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Zone updated successfully",
        data: result,
    });
});

// ----------------------------------- DELETE ZONE ---------------------------------------
const deleteZone = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await ZoneServices.deleteZone(id as string, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Zone deleted successfully",
        data: result,
    });
});

export const ZoneControllers = {
    createZone,
    getZones,
    getZoneById,
    updateZone,
    deleteZone,
};
