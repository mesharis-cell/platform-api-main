import { Router } from "express";
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
  UserControllers.getUsers
);

export const UserRoutes = router;
