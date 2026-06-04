import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import CustomizedError from "../../error/customized-error";
import { getRequiredString } from "../../utils/request";
import { OrderServices } from "../order/order.services";
import { SelfPickupServices } from "../self-pickup/self-pickup.services";
import { AssetServices } from "../asset/assets.services";
import { CompanyOfficeServices } from "./company-office.services";
import { PricingService } from "../../services/pricing.service";
import { DocumentService } from "../../services/document.service";
import { getPDFBufferFromS3 } from "../../services/s3.service";

const ctx = (req: any) => ({ user: req.user, platformId: req.platformId });

// ==================================== ORDERS ============================================
// All delegate to OrderServices with scope:"company" — every booking/event/
// status-history path is reused; only the authorization differs.

const listOrders = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const result = await OrderServices.getMyOrders(req.query, user, platformId, "company");
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Company orders fetched successfully",
        data: result,
    });
});

const getOrder = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const id = getRequiredString(req.params.id, "id");
    const result = await OrderServices.getOrderById(id, user, platformId, req.query, "company");
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Order details fetched successfully",
        data: result,
    });
});

const approveOrderQuote = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const id = getRequiredString(req.params.id, "id");
    const result = await OrderServices.approveQuote(id, user, platformId, req.body, {
        scope: "company",
    });
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Quote approved successfully.",
        data: result,
    });
});

const declineOrderQuote = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const id = getRequiredString(req.params.id, "id");
    const result = await OrderServices.declineQuote(id, user, platformId, req.body, {
        scope: "company",
    });
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Quote declined successfully.",
        data: result,
    });
});

// ================================== SELF-PICKUPS ========================================

const listSelfPickups = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const result = await SelfPickupServices.clientListSelfPickups(
        platformId,
        user.company_id,
        user.id,
        req.query as any,
        "company"
    );
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Company self-pickups fetched successfully",
        data: result,
    });
});

const getSelfPickup = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const id = getRequiredString(req.params.id, "id");
    const pickup = await SelfPickupServices.clientGetSelfPickupById(
        id,
        platformId,
        user,
        "company"
    );
    // Project pricing for the CLIENT role (sell-side only) — managers are
    // CLIENT, so this is the literal "CLIENT" projection, never margin.
    const projected = {
        ...pickup,
        self_pickup_pricing: PricingService.projectByRole(
            (pickup as any).self_pickup_pricing,
            "CLIENT"
        ),
    };
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Self-pickup details fetched",
        data: projected,
    });
});

const approveSelfPickupQuote = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.clientApproveQuote(
        id,
        platformId,
        user,
        { po_number: req.body.po_number, notes: req.body.notes },
        "company"
    );
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Quote approved",
        data: result,
    });
});

const declineSelfPickupQuote = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const id = getRequiredString(req.params.id, "id");
    const result = await SelfPickupServices.clientDeclineQuote(
        id,
        platformId,
        user,
        { decline_reason: req.body.decline_reason },
        "company"
    );
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Quote declined",
        data: result,
    });
});

// ===================================== DASHBOARD ========================================

const getDashboard = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const result = await CompanyOfficeServices.getDashboardSummary(user, platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Company dashboard fetched successfully",
        data: result,
    });
});

// ====================================== MEMBERS =========================================

const listMembers = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const result = await CompanyOfficeServices.listMembers(user, platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Company members fetched successfully",
        data: result,
    });
});

// ================================== COST ESTIMATES ======================================

const listCostEstimates = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const result = await CompanyOfficeServices.listCostEstimates(user, platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Company cost estimates fetched successfully",
        data: result,
    });
});

const downloadCostEstimatePdf = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const id = getRequiredString(req.params.id, "id");
    const entityTypeRaw = String(req.query.entity_type || "ORDER").toUpperCase();
    if (entityTypeRaw !== "ORDER" && entityTypeRaw !== "SELF_PICKUP") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "entity_type must be ORDER or SELF_PICKUP"
        );
    }
    const entityType = entityTypeRaw as "ORDER" | "SELF_PICKUP";
    const { entityId, referenceId, financialStatus } =
        await CompanyOfficeServices.resolveEstimateTarget(user, platformId, entityType, id);

    // A QUOTED→QUOTE_REVISED revert leaves the OLD estimate PDF on S3 with stale prices/items
    // until admin re-approves. Block the company-manager download in the interim so they never
    // pull a superseded quote. Self-pickups never hit QUOTE_REVISED (OQ7), so this is ORDER-only
    // in practice. The gate self-clears once re-approval moves financial_status off QUOTE_REVISED.
    if (financialStatus === "QUOTE_REVISED") {
        throw new CustomizedError(
            httpStatus.CONFLICT,
            "This quote is being revised — a new estimate will be available once it is re-approved.",
            { code: "QUOTE_REVISED" }
        );
    }

    // Idempotent fetch: serve the existing PDF; if absent, regenerate only when
    // the entity is still in a status DocumentService will generate for —
    // otherwise the estimate genuinely isn't available (404).
    const key = await DocumentService.getEstimateUrl(entityType, entityId, platformId);
    let buffer: Buffer;
    try {
        buffer = await getPDFBufferFromS3(key);
    } catch (_) {
        try {
            await DocumentService.regenerateEstimate(entityType, entityId, platformId);
            buffer = await getPDFBufferFromS3(key);
        } catch (_e) {
            throw new CustomizedError(
                httpStatus.NOT_FOUND,
                "Cost estimate is not available for this record"
            );
        }
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="cost-estimate-${referenceId}.pdf"`);
    res.setHeader("Content-Length", buffer.length);
    res.status(httpStatus.OK).send(buffer);
});

// ======================================= ASSETS ========================================
// List + detail reuse the CLIENT-scoped AssetServices (managers are role=CLIENT,
// so getAssets/getAssetById already pin to user.company_id). Only the narrow
// edit is company-office-specific.

const listAssets = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const result = await AssetServices.getAssets(req.query, user, platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Company assets fetched successfully",
        data: result,
    });
});

const getAsset = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const id = getRequiredString(req.params.id, "id");
    const result = await AssetServices.getAssetById(id, user, platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset details fetched successfully",
        data: result,
    });
});

const editAsset = catchAsync(async (req, res) => {
    const { user, platformId } = ctx(req);
    const id = getRequiredString(req.params.id, "id");
    const result = await AssetServices.companyEditAsset(id, req.body, user, platformId);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Asset updated successfully",
        data: result,
    });
});

export const CompanyOfficeControllers = {
    listOrders,
    getOrder,
    approveOrderQuote,
    declineOrderQuote,
    listSelfPickups,
    getSelfPickup,
    approveSelfPickupQuote,
    declineSelfPickupQuote,
    getDashboard,
    listMembers,
    listCostEstimates,
    downloadCostEstimatePdf,
    listAssets,
    getAsset,
    editAsset,
};
