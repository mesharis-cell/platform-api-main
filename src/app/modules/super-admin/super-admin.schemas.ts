import { z } from "zod";

const login = z.object({
    body: z.object({
        email: z.email("Invalid email address").min(1, "Email is required"),
        password: z.string().min(1, "Password is required"),
    }),
});

const updateMaintenance = z.object({
    body: z.object({
        enabled: z.boolean(),
        message: z
            .string()
            .max(500, "Message must be 500 characters or fewer")
            .nullable()
            .optional(),
        until: z.string().datetime("until must be a valid ISO datetime").nullable().optional(),
    }),
});

const refresh = z.object({
    body: z.object({
        refresh_token: z.string().min(1, "Refresh token is required"),
    }),
});

export const SuperAdminSchemas = {
    login,
    refresh,
    updateMaintenance,
};
