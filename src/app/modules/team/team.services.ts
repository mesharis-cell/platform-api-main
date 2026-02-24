import { and, eq } from "drizzle-orm";
import { db } from "../../../db";
import { teamMembers, teams, users } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import httpStatus from "http-status";

const getTeams = async (
    companyId: string | undefined,
    platformId: string,
    userId: string,
    role: string
) => {
    const where = companyId
        ? and(eq(teams.platform_id, platformId), eq(teams.company_id, companyId))
        : eq(teams.platform_id, platformId);

    const result = await db.query.teams.findMany({
        where,
        with: { members: { with: { user: { columns: { id: true, name: true, email: true } } } } },
        orderBy: (t, { asc }) => [asc(t.name)],
    });

    return result;
};

const createTeam = async (data: {
    platform_id: string;
    company_id: string;
    name: string;
    description?: string;
    can_other_teams_see?: boolean;
    can_other_teams_book?: boolean;
}) => {
    const [team] = await db.insert(teams).values(data).returning();
    return team;
};

const updateTeam = async (
    id: string,
    platformId: string,
    data: {
        name?: string;
        description?: string | null;
        can_other_teams_see?: boolean;
        can_other_teams_book?: boolean;
    }
) => {
    const existing = await db.query.teams.findFirst({
        where: and(eq(teams.id, id), eq(teams.platform_id, platformId)),
    });
    if (!existing) throw new CustomizedError(httpStatus.NOT_FOUND, "Team not found");

    const [updated] = await db.update(teams).set(data).where(eq(teams.id, id)).returning();
    return updated;
};

const deleteTeam = async (id: string, platformId: string) => {
    const existing = await db.query.teams.findFirst({
        where: and(eq(teams.id, id), eq(teams.platform_id, platformId)),
    });
    if (!existing) throw new CustomizedError(httpStatus.NOT_FOUND, "Team not found");

    await db.delete(teams).where(eq(teams.id, id));
};

const addMember = async (teamId: string, userId: string, platformId: string) => {
    const team = await db.query.teams.findFirst({
        where: and(eq(teams.id, teamId), eq(teams.platform_id, platformId)),
    });
    if (!team) throw new CustomizedError(httpStatus.NOT_FOUND, "Team not found");

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new CustomizedError(httpStatus.NOT_FOUND, "User not found");

    const existing = await db.query.teamMembers.findFirst({
        where: and(eq(teamMembers.team_id, teamId), eq(teamMembers.user_id, userId)),
    });
    if (existing) throw new CustomizedError(httpStatus.CONFLICT, "User already in team");

    const [member] = await db
        .insert(teamMembers)
        .values({ team_id: teamId, user_id: userId })
        .returning();
    return member;
};

const removeMember = async (teamId: string, userId: string, platformId: string) => {
    const team = await db.query.teams.findFirst({
        where: and(eq(teams.id, teamId), eq(teams.platform_id, platformId)),
    });
    if (!team) throw new CustomizedError(httpStatus.NOT_FOUND, "Team not found");

    await db
        .delete(teamMembers)
        .where(and(eq(teamMembers.team_id, teamId), eq(teamMembers.user_id, userId)));
};

export const TeamServices = {
    getTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    addMember,
    removeMember,
};
