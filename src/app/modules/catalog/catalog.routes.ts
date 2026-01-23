import { Router } from "express";
import auth from "../../middleware/auth";
import { CatalogControllers } from "./catalog.controllers";

import platformValidator from "../../middleware/platform-validator";

const router = Router();

// Browse catalog
router.get("/", platformValidator, auth("CLIENT"), CatalogControllers.getCatalog);

export const CatalogRoutes = router;
