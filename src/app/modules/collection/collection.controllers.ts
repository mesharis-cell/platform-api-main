import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { CollectionServices } from "./collection.services";
import { getRequiredString } from "../../utils/request";

// ----------------------------------- CREATE COLLECTION -----------------------------------
const createCollection = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;

    const collectionData = {
        ...req.body,
        platform_id: platformId,
    };

    const result = await CollectionServices.createCollection(collectionData);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Collection created successfully",
        data: result,
    });
});

// ----------------------------------- GET COLLECTIONS -------------------------------------
const getCollections = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    const result = await CollectionServices.getCollections(req.query, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Collections fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// ----------------------------------- GET COLLECTION BY ID --------------------------------
const getCollectionById = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await CollectionServices.getCollectionById(id, user, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Collection fetched successfully",
        data: result,
    });
});

// ----------------------------------- UPDATE COLLECTION ---------------------------------------
const updateCollection = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await CollectionServices.updateCollection(id, req.body, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Collection updated successfully",
        data: result,
    });
});

// ----------------------------------- DELETE COLLECTION ---------------------------------------
const deleteCollection = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await CollectionServices.deleteCollection(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Collection deleted successfully",
        data: result,
    });
});

// ----------------------------------- ADD COLLECTION ITEM -----------------------------------
const addCollectionItem = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const itemData = {
        ...req.body,
        collection_id: id,
    };

    const result = await CollectionServices.addCollectionItem(id, itemData, platformId);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Item added to collection successfully",
        data: result,
    });
});

// ----------------------------------- UPDATE COLLECTION ITEM -----------------------------------
const updateCollectionItem = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const itemId = getRequiredString(req.params.itemId, "itemId");

    const result = await CollectionServices.updateCollectionItem(id, itemId, req.body, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Collection item updated successfully",
        data: result,
    });
});

// ----------------------------------- DELETE COLLECTION ITEM -----------------------------------
const deleteCollectionItem = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");
    const itemId = getRequiredString(req.params.itemId, "itemId");

    const result = await CollectionServices.deleteCollectionItem(id, itemId, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Collection item deleted successfully",
        data: result,
    });
});

// ----------------------------------- CHECK COLLECTION AVAILABILITY -----------------------------------
const checkCollectionAvailability = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const id = getRequiredString(req.params.id, "id");

    const result = await CollectionServices.checkCollectionAvailability(
        id,
        user,
        platformId,
        req.query
    );

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Collection availability checked successfully",
        data: result,
    });
});

export const CollectionControllers = {
    createCollection,
    getCollections,
    getCollectionById,
    updateCollection,
    deleteCollection,
    addCollectionItem,
    updateCollectionItem,
    deleteCollectionItem,
    checkCollectionAvailability,
};
