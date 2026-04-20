import { Router } from "express";
import auth from "../../middleware/auth";
import platformValidator from "../../middleware/platform-validator";
import { TeamControllers } from "./team.controllers";

const router = Router();

router.get("/", platformValidator, auth("CLIENT"), TeamControllers.getTeamsForClient);

export const TeamClientRoutes = router;
