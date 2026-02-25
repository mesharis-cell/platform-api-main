import httpStatus from "http-status";
import catchAsync from "../../shared/catch-async";
import sendResponse from "../../shared/send-response";
import { TeamServices } from "./team.services";

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
    const result = await TeamServices.updateTeam(req.params.id, platformId, req.body);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Team updated",
        data: result,
    });
});

const deleteTeam = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    await TeamServices.deleteTeam(req.params.id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Team deleted",
        data: null,
    });
});

const addMember = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    const result = await TeamServices.addMember(req.params.id, req.body.user_id, platformId);

    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Member added",
        data: result,
    });
});

const removeMember = catchAsync(async (req, res) => {
    const platformId = (req as any).platformId;
    await TeamServices.removeMember(req.params.id, req.params.userId, platformId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Member removed",
        data: null,
    });
});

export const TeamControllers = {
    getTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    addMember,
    removeMember,
};
