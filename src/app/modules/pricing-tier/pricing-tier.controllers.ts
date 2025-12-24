import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { PricingTierServices } from "./pricing-tier.services";

// ----------------------------------- CREATE PRICING TIER -----------------------------------
const createPricingTier = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;

    const pricingTierData = {
        ...req.body,
        platform_id: platformId,
    };

    const result = await PricingTierServices.createPricingTier(pricingTierData);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Pricing tier created successfully",
        data: result,
    });
});

// ----------------------------------- GET PRICING TIERS -------------------------------------
const getPricingTiers = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;

    const result = await PricingTierServices.getPricingTiers(req.query, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Pricing tiers fetched successfully",
        meta: result.meta,
        data: result.data,
    });
});

// ----------------------------------- GET PRICING TIER BY ID --------------------------------
const getPricingTierById = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await PricingTierServices.getPricingTierById(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Pricing tier fetched successfully",
        data: result,
    });
});

// ----------------------------------- UPDATE PRICING TIER ---------------------------------------
const updatePricingTier = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await PricingTierServices.updatePricingTier(id, req.body, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Pricing tier updated successfully",
        data: result,
    });
});

// ----------------------------------- DELETE PRICING TIER ---------------------------------------
const deletePricingTier = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const { id } = req.params;

    const result = await PricingTierServices.deletePricingTier(id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Pricing tier deleted successfully",
        data: result,
    });
});

// ----------------------------------- GET PRICING TIER LOCATIONS --------------------------------
const getPricingTierLocations = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;

    const result = await PricingTierServices.getPricingTierLocations(platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Pricing tier locations fetched successfully",
        data: result,
    });
});

export const PricingTierControllers = {
    createPricingTier,
    getPricingTiers,
    getPricingTierById,
    updatePricingTier,
    deletePricingTier,
    getPricingTierLocations,
};
