import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { EventsControllers } from "./events.controllers";

const router = Router();

router.get("/", platformValidator, auth("ADMIN"), EventsControllers.listEvents);

export const EventsRoutes = router;
