import { Router } from "express";
import payloadValidator from "../../middleware/payload-validator";
import { CollectionSchemas } from "./collection.schemas";

const router = Router();

router.post(
  "/",
  payloadValidator(CollectionSchemas.createCollection),
);

router.get("/");

router.get("/:id");

router.put(
  "/:id",
  payloadValidator(CollectionSchemas.updateCollection),
);

router.delete("/:id");

export const CollectionRoutes = router;
