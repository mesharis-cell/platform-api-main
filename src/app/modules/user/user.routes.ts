import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { UserControllers } from "./user.controllers";
import { UserSchemas } from "./user.schemas";

const router = Router();

// Create user (admin)
router.post(
  "/",
  platformValidator,
  auth('ADMIN'),
  payloadValidator(UserSchemas.createUser),
  UserControllers.createUser
);

// Get all users (admin & logistics)
router.get(
  "/",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  UserControllers.getUsers
);

// Get single user by ID
router.get(
  "/:id",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  UserControllers.getUserById
);

// Update user
router.patch(
  "/:id",
  platformValidator,
  auth("ADMIN"),
  payloadValidator(UserSchemas.updateUser),
  UserControllers.updateUser
);

export const UserRoutes = router;
