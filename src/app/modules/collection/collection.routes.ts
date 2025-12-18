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


// collection items
router.post("/:id/items", payloadValidator(CollectionSchemas.createCollectionItem));

router.put("/:id/items/:itemId", payloadValidator(CollectionSchemas.updateCollectionItem));

router.delete("/:id/items/:itemId");

router.get("/:id/availability");


export const CollectionRoutes = router;
