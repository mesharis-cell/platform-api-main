import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { AssetCategoryControllers } from "./asset-categories.controllers";
import { AssetCategorySchemas } from "./asset-categories.schemas";

const router = Router();

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.ASSETS_READ),
    AssetCategoryControllers.listCategories
);

router.post(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.ASSETS_CREATE),
    payloadValidator(AssetCategorySchemas.createAssetCategory),
    AssetCategoryControllers.createCategory
);

router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ASSETS_UPDATE),
    payloadValidator(AssetCategorySchemas.updateAssetCategory),
    AssetCategoryControllers.updateCategory
);

router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.ASSETS_DELETE),
    AssetCategoryControllers.deleteCategory
);

export const AssetCategoryRoutes = router;
