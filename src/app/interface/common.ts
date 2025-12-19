export type AuthUser = {
  id: string;
  contact_number: string;
  email: string;
  role: "ADMIN" | "CLIENT" | "LOGISTICS";
  iat: number;
  exp: number;
};
