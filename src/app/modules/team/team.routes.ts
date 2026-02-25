import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import { TeamControllers } from "./team.controllers";
import { TeamSchemas } from "./team.schemas";

const router = Router();

router.get("/", platformValidator, auth("ADMIN", "LOGISTICS"), TeamControllers.getTeams);

router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(TeamSchemas.createTeamSchema),
    TeamControllers.createTeam
);

router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(TeamSchemas.updateTeamSchema),
    TeamControllers.updateTeam
);

router.delete("/:id", platformValidator, auth("ADMIN"), TeamControllers.deleteTeam);

router.post(
    "/:id/members",
    platformValidator,
    auth("ADMIN"),
    payloadValidator(TeamSchemas.addMemberSchema),
    TeamControllers.addMember
);

router.delete(
    "/:id/members/:userId",
    platformValidator,
    auth("ADMIN"),
    TeamControllers.removeMember
);

export const TeamRoutes = router;
