import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import { AuthControllers } from "./Auth.controllers";
import { AuthValidations } from "./Auth.validations";

const router = Router();



router.post(
  "/login",
  payloadValidator(AuthValidations.loginValidationSchema),
  AuthControllers.login
);

export const AuthRoutes = router;
