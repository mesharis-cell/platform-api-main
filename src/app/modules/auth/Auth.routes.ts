import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { AuthControllers } from "./Auth.controllers";
import { AuthSchemas } from "./Auth.schemas";
import auth from "../../middleware/auth";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";

const router = Router();

router.get("/context", AuthControllers.getPlatformByDomain);

router.post(
    "/login",
    platformValidator,
    payloadValidator(AuthSchemas.loginValidationSchema),
    AuthControllers.login
);

router.post(
    "/reset-password",
    platformValidator,
    auth("ADMIN", "LOGISTICS", "CLIENT"),
    requirePermission(PERMISSIONS.AUTH_RESET_PASSWORD),
    payloadValidator(AuthSchemas.resetPasswordValidationSchema),
    AuthControllers.resetPassword
);

router.post(
    "/forgot-password",
    platformValidator,
    payloadValidator(AuthSchemas.forgotPasswordSchema),
    AuthControllers.forgotPassword
);

export const AuthRoutes = router;
