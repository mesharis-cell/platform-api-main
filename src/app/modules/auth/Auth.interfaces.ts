import z from "zod";
import { AuthSchemas } from "./Auth.schemas";



export interface LoginCredential {
  email: string;
  password: string;
}

export interface ResetPasswordPayload {
  email: string;
  current_password: string;
  new_password: string;
}
// ----------------------------------- FORGOT PASSWORD PAYLOAD --------------------------------
export type ForgotPasswordPayload = z.infer<typeof AuthSchemas.forgotPasswordSchema>["body"];