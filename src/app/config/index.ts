import dotenv from "dotenv";
import type { StringValue } from "ms";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
    node_env: process.env.NODE_ENV,
    port: process.env.PORT,
    database_url: process.env.DATABASE_URL,
    client_url: process.env.CLIENT_URL,
    server_url: process.env.SERVER_URL,
    salt_rounds: Number(process.env.SALT_ROUNDS),
    jwt_access_secret: process.env.JWT_ACCESS_SECRET,
    jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
    jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN as StringValue,
    jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN as StringValue,
    resend_api_key: process.env.RESEND_API_KEY,
    email_from: process.env.EMAIL_FROM,
    app_name: process.env.APP_NAME || "Asset Fulfillment System",
    frontend_url: process.env.FRONTEND_URL,
    aws_region: process.env.AWS_REGION,
    aws_s3_bucket: process.env.AWS_BUCKET_NAME,
    aws_access_key_id: process.env.AWS_ACCESS_KEY_ID,
    aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
    system_user_email: process.env.SYSTEM_USER_EMAIL || "unknown@system.internal",
    system_user_password: process.env.SYSTEM_USER_PASSWORD || "unknown",
};
