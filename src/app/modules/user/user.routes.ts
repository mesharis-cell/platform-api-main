import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { UserControllers } from "./user.controllers";
import { UserSchemas } from "./user.schemas";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

// Create user (admin)
router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_CREATE),
    payloadValidator(UserSchemas.createUser),
    UserControllers.createUser
);

// Get all users (admin & logistics)
router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.USERS_READ),
    UserControllers.getUsers
);

// Get single user by ID
router.get(
    "/:id",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(PERMISSIONS.USERS_READ),
    UserControllers.getUserById
);

// Update user
router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_UPDATE),
    payloadValidator(UserSchemas.updateUser),
    UserControllers.updateUser
);

// Set user password (admin only)
router.patch(
    "/:id/password",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_MANAGE_PASSWORD),
    payloadValidator(UserSchemas.setUserPassword),
    UserControllers.setUserPassword
);

// Generate temporary user password (admin only)
router.post(
    "/:id/password/generate",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.USERS_MANAGE_PASSWORD),
    payloadValidator(UserSchemas.generateUserPassword),
    UserControllers.generateUserPassword
);

export const UserRoutes = router;
