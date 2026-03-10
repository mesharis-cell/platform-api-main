import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { AccessPolicyControllers } from "./access-policy.controllers";
import { AccessPolicySchemas } from "./access-policy.schemas";

const router = Router();

router.get(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_READ),
    AccessPolicyControllers.listAccessPolicies
);

router.get(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_READ),
    AccessPolicyControllers.getAccessPolicyById
);

router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_UPDATE),
    payloadValidator(AccessPolicySchemas.createAccessPolicySchema),
    AccessPolicyControllers.createAccessPolicy
);

router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_UPDATE),
    payloadValidator(AccessPolicySchemas.updateAccessPolicySchema),
    AccessPolicyControllers.updateAccessPolicy
);

router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_UPDATE),
    AccessPolicyControllers.deleteAccessPolicy
);

export const AccessPolicyRoutes = router;
