import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import featureValidator from "../../middleware/feature-validator";
import { PERMISSIONS } from "../../constants/permissions";
import { featureNames } from "../../constants/common";
import { CompanyOfficeControllers } from "./company-office.controllers";
import { CompanyOfficeSchemas } from "./company-office.schemas";
import { orderSchemas } from "../order/order.schemas";
import { SelfPickupSchemas } from "../self-pickup/self-pickup.schemas";

// ================================= COMPANY BACK OFFICE ===================================
// Mounted under /client/v1/company. The whole tree is CLIENT-only and feature-
// gated by enable_company_backoffice. Each route layers a granular
// requirePermission(company:*). Company scope is derived server-side from
// user.company_id in every service — never from a request param.

export const CompanyOfficeRoutes = (() => {
    const router = Router();

    // Shared middleware chain for every company-office route. Spread into each
    // route definition before the (optional) validator + controller.
    const base = (permission: string) => [
        platformValidator,
        auth("CLIENT"),
        requirePermission(permission),
        featureValidator(featureNames.enable_company_backoffice),
    ];

    // ----- Dashboard -----
    router.get(
        "/dashboard",
        ...base(PERMISSIONS.COMPANY_VIEW_DASHBOARD),
        CompanyOfficeControllers.getDashboard
    );

    // ----- Orders (company-scoped) -----
    router.get(
        "/order",
        ...base(PERMISSIONS.COMPANY_VIEW_ALL_ORDERS),
        CompanyOfficeControllers.listOrders
    );
    router.get(
        "/order/:id",
        ...base(PERMISSIONS.COMPANY_VIEW_ALL_ORDERS),
        CompanyOfficeControllers.getOrder
    );
    router.post(
        "/order/:id/approve-quote",
        ...base(PERMISSIONS.COMPANY_MANAGE_QUOTES),
        payloadValidator(orderSchemas.approveQuoteSchema),
        CompanyOfficeControllers.approveOrderQuote
    );
    router.post(
        "/order/:id/decline-quote",
        ...base(PERMISSIONS.COMPANY_MANAGE_QUOTES),
        payloadValidator(orderSchemas.declineQuoteSchema),
        CompanyOfficeControllers.declineOrderQuote
    );

    // ----- Self-pickups (company-scoped) -----
    router.get(
        "/self-pickup",
        ...base(PERMISSIONS.COMPANY_VIEW_ALL_ORDERS),
        CompanyOfficeControllers.listSelfPickups
    );
    router.get(
        "/self-pickup/:id",
        ...base(PERMISSIONS.COMPANY_VIEW_ALL_ORDERS),
        CompanyOfficeControllers.getSelfPickup
    );
    router.post(
        "/self-pickup/:id/approve-quote",
        ...base(PERMISSIONS.COMPANY_MANAGE_QUOTES),
        payloadValidator(SelfPickupSchemas.approveQuoteSchema),
        CompanyOfficeControllers.approveSelfPickupQuote
    );
    router.post(
        "/self-pickup/:id/decline-quote",
        ...base(PERMISSIONS.COMPANY_MANAGE_QUOTES),
        payloadValidator(SelfPickupSchemas.declineQuoteSchema),
        CompanyOfficeControllers.declineSelfPickupQuote
    );

    // ----- Members (read-only) -----
    router.get(
        "/members",
        ...base(PERMISSIONS.COMPANY_VIEW_USERS),
        CompanyOfficeControllers.listMembers
    );

    // ----- Cost estimates -----
    router.get(
        "/cost-estimates",
        ...base(PERMISSIONS.COMPANY_VIEW_ESTIMATES),
        CompanyOfficeControllers.listCostEstimates
    );
    router.get(
        "/cost-estimate/:id/pdf",
        ...base(PERMISSIONS.COMPANY_VIEW_ESTIMATES),
        CompanyOfficeControllers.downloadCostEstimatePdf
    );

    // ----- Assets (browse + narrow presentation edit) -----
    router.get(
        "/asset",
        ...base(PERMISSIONS.COMPANY_EDIT_ASSETS),
        CompanyOfficeControllers.listAssets
    );
    router.get(
        "/asset/:id",
        ...base(PERMISSIONS.COMPANY_EDIT_ASSETS),
        CompanyOfficeControllers.getAsset
    );
    router.patch(
        "/asset/:id",
        ...base(PERMISSIONS.COMPANY_EDIT_ASSETS),
        payloadValidator(CompanyOfficeSchemas.companyEditAssetSchema),
        CompanyOfficeControllers.editAsset
    );

    return router;
})();
