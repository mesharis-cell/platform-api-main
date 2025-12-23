import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { CollectionControllers } from "./collection.controllers";
import { CollectionSchemas } from "./collection.schemas";

const router = Router();

// Create collection
router.post(
  "/",
  platformValidator,
  auth('ADMIN', 'LOGISTICS'),
  payloadValidator(CollectionSchemas.collectionSchema),
  CollectionControllers.createCollection
);

// Get all collections
router.get("/", platformValidator, auth('ADMIN', 'LOGISTICS', 'CLIENT'), CollectionControllers.getCollections);

// Get collection by id
router.get("/:id", platformValidator, auth('ADMIN', 'LOGISTICS', 'CLIENT'), CollectionControllers.getCollectionById);

// Update collection
router.patch("/:id", platformValidator, auth('ADMIN', 'LOGISTICS'), payloadValidator(CollectionSchemas.updateCollectionSchema), CollectionControllers.updateCollection);

// Delete collection
router.delete("/:id", platformValidator, auth('ADMIN'), CollectionControllers.deleteCollection);

// ----------------------------------- COLLECTION ITEMS -----------------------------------

// Add item to collection
router.post("/:id/items", platformValidator, auth('ADMIN', 'LOGISTICS'), payloadValidator(CollectionSchemas.collectionItemSchema), CollectionControllers.addCollectionItem);

// Update collection item
router.patch("/:id/items/:itemId", platformValidator, auth('ADMIN', 'LOGISTICS'), payloadValidator(CollectionSchemas.updateCollectionItemSchema), CollectionControllers.updateCollectionItem);

// Delete collection item
router.delete("/:id/items/:itemId", platformValidator, auth('ADMIN', 'LOGISTICS'), CollectionControllers.deleteCollectionItem);

// Check collection availability
router.get("/:id/availability", platformValidator, auth('ADMIN', 'LOGISTICS', 'CLIENT'), CollectionControllers.checkCollectionAvailability);

export const CollectionRoutes = router;
