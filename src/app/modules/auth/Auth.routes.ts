import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { AuthControllers } from "./Auth.controllers";
import { AuthValidations } from "./Auth.validations";

const router = Router();



router.post(
  "/login",
  platformValidator,
  payloadValidator(AuthValidations.loginValidationSchema),
  AuthControllers.login
);

export const AuthRoutes = router;
