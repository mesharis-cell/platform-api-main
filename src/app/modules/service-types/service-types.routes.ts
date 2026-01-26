import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { ServiceTypesControllers } from "./service-types.controllers";
import { ServiceTypesSchemas } from "./service-types.schemas";

const router = Router();

// List all service types
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    // requirePermission(PERMISSIONS.SERVICE_TYPES_MANAGE),
    ServiceTypesControllers.listServiceTypes
);

// Get service type by ID
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    // requirePermission(PERMISSIONS.SERVICE_TYPES_MANAGE),
    ServiceTypesControllers.getServiceTypeById
);

// Create service type
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    // requirePermission(PERMISSIONS.SERVICE_TYPES_MANAGE),
    payloadValidator(ServiceTypesSchemas.createServiceTypeSchema),
    ServiceTypesControllers.createServiceType
);

// Update service type
router.put(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    // requirePermission(PERMISSIONS.SERVICE_TYPES_MANAGE),
    payloadValidator(ServiceTypesSchemas.updateServiceTypeSchema),
    ServiceTypesControllers.updateServiceType
);

// Delete (deactivate) service type
router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    // requirePermission(PERMISSIONS.SERVICE_TYPES_MANAGE),
    ServiceTypesControllers.deleteServiceType
);

export const ServiceTypesRoutes = router;
