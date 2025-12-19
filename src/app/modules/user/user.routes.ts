import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { UserControllers } from "./user.controllers";
import { UserSchemas } from "./user.schemas";

const router = Router();

router.post(
  "/",
  platformValidator,
  payloadValidator(UserSchemas.createUser),
  UserControllers.createUser
);

router.get(
  "/",
  platformValidator,
  auth('ADMIN'),
  UserControllers.getUsers
);

export const UserRoutes = router;
