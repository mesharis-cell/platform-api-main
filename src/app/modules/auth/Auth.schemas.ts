import { z } from "zod";


const loginValidationSchema = z.object({
  body: z.object({
    email: z
      .email("Invalid email address")
      .min(1, { message: "Email is required" }),
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

export const AuthSchemas = {
  loginValidationSchema,
  resetPasswordValidationSchema,
};
