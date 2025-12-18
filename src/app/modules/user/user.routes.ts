import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import { UserControllers } from "./user.controllers";
import { UserSchemas } from "./user.schemas";

const router = Router();

router.post(
  "/",
  payloadValidator(UserSchemas.createUser),
  UserControllers.createUser
);

export const UserRoutes = router;
