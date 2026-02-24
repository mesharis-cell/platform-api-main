import z from "zod";

const createTeamSchema = z.object({
    body: z.object({
        company_id: z.string().uuid("Invalid company ID"),
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        can_other_teams_see: z.boolean().default(true),
        can_other_teams_book: z.boolean().default(false),
    }),
});

const updateTeamSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional().nullable(),
        can_other_teams_see: z.boolean().optional(),
        can_other_teams_book: z.boolean().optional(),
    }),
});

const addMemberSchema = z.object({
    body: z.object({
        user_id: z.string().uuid("Invalid user ID"),
    }),
});

export const TeamSchemas = { createTeamSchema, updateTeamSchema, addMemberSchema };
