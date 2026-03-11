import dotenv from "dotenv";
import type { StringValue } from "ms";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

const asNumber = (value: string | undefined, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export default {
    node_env: process.env.NODE_ENV,
    port: process.env.PORT,
    database_url: process.env.DATABASE_URL,
    server_url: process.env.SERVER_URL,
    salt_rounds: Number(process.env.SALT_ROUNDS),
    jwt_access_secret: process.env.JWT_ACCESS_SECRET,
    jwt_refresh_secret: process.env.JWT_REFRESH_SECRET,
    jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN as StringValue,
    jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN as StringValue,
    resend_api_key: process.env.RESEND_API_KEY,
    email_from: process.env.EMAIL_FROM,
    email_reply_to: process.env.EMAIL_REPLY_TO,
    email_unsubscribe_secret: process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.JWT_ACCESS_SECRET,
    email_unsubscribe_base_url: process.env.EMAIL_UNSUBSCRIBE_BASE_URL || process.env.SERVER_URL,
    app_name: process.env.APP_NAME || "Asset Fulfillment System",
    aws_region: process.env.AWS_REGION,
    aws_s3_bucket: process.env.AWS_BUCKET_NAME,
    aws_access_key_id: process.env.AWS_ACCESS_KEY_ID,
    aws_secret_access_key: process.env.AWS_SECRET_ACCESS_KEY,
    system_user_email: process.env.SYSTEM_USER_EMAIL || "unknown@system.internal",
    system_user_password: process.env.SYSTEM_USER_PASSWORD || "unknown",
    email_rate_limit_per_second: asNumber(process.env.EMAIL_RATE_LIMIT_PER_SECOND, 2),
    email_worker_batch_size: asNumber(process.env.EMAIL_WORKER_BATCH_SIZE, 2),
    email_max_attempts: asNumber(process.env.EMAIL_MAX_ATTEMPTS, 8),
    email_processing_timeout_seconds: asNumber(process.env.EMAIL_PROCESSING_TIMEOUT_SECONDS, 300),
};
