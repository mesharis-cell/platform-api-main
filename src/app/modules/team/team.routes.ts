import { Router } from "express";
import auth from "../../middleware/auth";
import payloadValidator from "../../middleware/payload-validator";
import platformValidator from "../../middleware/platform-validator";
import requirePermission from "../../middleware/permission";
import { PERMISSIONS } from "../../constants/permissions";
import { TeamControllers } from "./team.controllers";
import { TeamSchemas } from "./team.schemas";

const router = Router();

router.get(
    "/",
    platformValidator,
    auth("ADMIN", "LOGISTICS"),
    requirePermission(
        PERMISSIONS.TEAMS_READ,
        PERMISSIONS.TEAMS_CREATE,
        PERMISSIONS.TEAMS_UPDATE,
        PERMISSIONS.TEAMS_DELETE,
        PERMISSIONS.TEAMS_MANAGE_MEMBERS
    ),
    TeamControllers.getTeams
);

router.post(
    "/",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.TEAMS_CREATE),
    payloadValidator(TeamSchemas.createTeamSchema),
    TeamControllers.createTeam
);

router.patch(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.TEAMS_UPDATE),
    payloadValidator(TeamSchemas.updateTeamSchema),
    TeamControllers.updateTeam
);

router.delete(
    "/:id",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.TEAMS_DELETE),
    TeamControllers.deleteTeam
);

router.post(
    "/:id/members",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.TEAMS_MANAGE_MEMBERS),
    payloadValidator(TeamSchemas.addMemberSchema),
    TeamControllers.addMember
);

router.delete(
    "/:id/members/:userId",
    platformValidator,
    auth("ADMIN"),
    requirePermission(PERMISSIONS.TEAMS_MANAGE_MEMBERS),
    TeamControllers.removeMember
);

export const TeamRoutes = router;
