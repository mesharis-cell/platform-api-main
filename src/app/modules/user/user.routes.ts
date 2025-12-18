import { Router } from "express";
import { UserSchemas } from "./user.schemas";
import payloadValidator from "../../middleware/payload-validator";

const router = Router();

router.post(
  "/",
  payloadValidator(UserSchemas.createUser),
);

export const UserRoutes = router;
