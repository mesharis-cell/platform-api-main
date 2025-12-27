import dotenv from "dotenv";
import type { StringValue } from "ms";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  node_env: process.env.NODE_ENV,
  port: process.env.PORT,
  database_url: process.env.DATABASE_URL,
  salt_rounds: Number(process.env.SALT_ROUNDS),
  jwt_access_secret: process.env.JWT_ACCESS_SECRET,
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN as StringValue,
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN as StringValue,
  smtp_host: process.env.SMTP_HOST,
  smtp_port: Number(process.env.SMTP_PORT),
  smtp_user: process.env.SMTP_USER,
  smtp_pass: process.env.SMTP_PASS,
  email_from: process.env.EMAIL_FROM,
  app_name: process.env.APP_NAME || "Asset Fulfillment System",
};
