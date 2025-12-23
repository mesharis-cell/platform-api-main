import jwt, { JwtPayload, Secret } from "jsonwebtoken";
import ms, { StringValue } from "ms";

export const tokenGenerator = (
  payload: JwtPayload,
  secret: Secret,
  expiresIn: StringValue | number
) => {
  const token = jwt.sign(payload, secret, { expiresIn });
  return token;
};

export const tokenVerifier = (token: string, secret: Secret) => {
  return jwt.verify(token, secret) as JwtPayload;
};

/**
 * Converts JWT expiry string (e.g., '1d', '7d', '1h') to milliseconds
 * for use in cookie maxAge
 */
export const expiryToMs = (expiry: StringValue | number): number => {
  if (typeof expiry === "number") {
    // If it's already a number, assume it's in seconds (JWT default)
    return expiry * 1000;
  }
  return ms(expiry);
};
