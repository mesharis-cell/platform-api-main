import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { AssetFamilyControllers } from "./asset-family.controllers";
import { AssetFamilySchemas } from "./asset-family.schemas";

const router = Router();

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ASSETS_READ),
    AssetFamilyControllers.listAssetFamilies
);

router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ASSETS_READ),
    AssetFamilyControllers.getAssetFamilyById
);

router.post(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_CREATE),
    payloadValidator(AssetFamilySchemas.createAssetFamilySchema),
    AssetFamilyControllers.createAssetFamily
);

router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_UPDATE),
    payloadValidator(AssetFamilySchemas.updateAssetFamilySchema),
    AssetFamilyControllers.updateAssetFamily
);

router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ASSETS_DELETE),
    AssetFamilyControllers.deleteAssetFamily
);

export const AssetFamilyRoutes = router;
