import { z } from "zod";





const loginValidationSchema = z.object({
  body: z.object({
    email: z
      .string()
      .email("Invalid email address")
      .min(1, { message: "Email is required" }),
    password: z.string({ error: "Password is required" }),
  }),
});



export const AuthValidations = {

  loginValidationSchema,
};
