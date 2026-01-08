


export interface LoginCredential {
  email: string;
  password: string;
}

export interface ResetPasswordPayload {
  email: string;
  current_password: string;
  new_password: string;
}

