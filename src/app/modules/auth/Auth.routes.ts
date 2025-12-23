import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { AuthControllers } from "./Auth.controllers";
import { AuthValidations } from "./Auth.validations";

const router = Router();

router.get(
  "/context",
  AuthControllers.getPlatformByDomain
);

router.post(
  "/login",
  platformValidator,
  payloadValidator(AuthValidations.loginValidationSchema),
  AuthControllers.login
);

router.post(
  "/logout",
  AuthControllers.logout
);

export const AuthRoutes = router;
