import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { TeamServices } from "./team.services";
import { getRequiredString } from "../../utils/request";

const getTeams = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;
    const { company_id } = req.query as { company_id?: string };

    const result = await TeamServices.getTeams(company_id, platformId, user.id, user.role);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Teams fetched",
        data: result,
    });
});

const getTeamsForClient = catchAsync(async (req, res) => {
    const user = (req as any).user;
    const platformId = (req as any).platformId;

    if (!user?.company_id) {
        sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: "Teams fetched",
            data: [],
        });
        return;
    }

    const result = await TeamServices.getTeams(user.company_id, platformId, user.id, user.role);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Teams fetched",
        data: result,
    });
});

const createTeam = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const result = await TeamServices.createTeam({ ...req.body, platform_id: platformId });

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Team created",
        data: result,
    });
});

const updateTeam = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const teamId = getRequiredString(req.params.id, "id");
    const result = await TeamServices.updateTeam(teamId, platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Team updated",
        data: result,
    });
});

const deleteTeam = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const teamId = getRequiredString(req.params.id, "id");
    await TeamServices.deleteTeam(teamId, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Team deleted",
        data: null,
    });
});

const addMember = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const teamId = getRequiredString(req.params.id, "id");
    const result = await TeamServices.addMember(teamId, req.body.user_id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Member added",
        data: result,
    });
});

const removeMember = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const teamId = getRequiredString(req.params.id, "id");
    const userId = getRequiredString(req.params.userId, "userId");
    await TeamServices.removeMember(teamId, userId, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Member removed",
        data: null,
    });
});

export const TeamControllers = {
    getTeams,
    getTeamsForClient,
    createTeam,
    updateTeam,
    deleteTeam,
    addMember,
    removeMember,
};
