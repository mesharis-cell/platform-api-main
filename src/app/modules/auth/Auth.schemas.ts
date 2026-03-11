import { z } from "zod";

const loginValidationSchema = z.object({
    body: z.object({
        email: z.email("Invalid email address").min(1, { message: "Email is required" }),
        password: z.string({ error: "Password is required" }),
    }),
});

const resetPasswordValidationSchema = z.object({
    body: z.object({
        current_password: z.string({ error: "Current password is required" }),
        new_password: z
            .string({ error: "New password is required" })
            .min(8, "New password must be at least 8 characters")
            .max(50, "New password must be at most 50 characters"),
    }),
});

const forgotPasswordSchema = z.object({
    body: z
        .object({
            email: z.email({ error: "Enter a valid email" }),
            otp: z.number({ error: "OTP should be a number" }).optional(),
            new_password: z
                .string({ error: "New password should be a text" })
                .min(8, "New password must be at least 8 characters")
                .max(50, "New password must be at most 50 characters")
                .optional(),
        })
        .strict(),
});

const refreshTokenSchema = z.object({
    body: z
        .object({
            refresh_token: z
                .string({ error: "Refresh token is required" })
                .min(1, "Refresh token is required"),
        })
        .strict(),
});

const unsubscribeQuerySchema = z.object({
    token: z.string().min(1, "token is required"),
});

const unsubscribeBodySchema = z.object({
    body: z
        .object({
            token: z.string().min(1, "token is required"),
        })
        .strict(),
});

export const AuthSchemas = {
    loginValidationSchema,
    resetPasswordValidationSchema,
    forgotPasswordSchema,
    refreshTokenSchema,
    unsubscribeQuerySchema,
    unsubscribeBodySchema,
};
