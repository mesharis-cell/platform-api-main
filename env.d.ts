declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: "development" | "production" | "test";
        DATABASE_URL: string;
        CLIENT_URL: string;
        SERVER_URL: string;
        PORT: string;
        SALT_ROUNDS: string;
        JWT_ACCESS_SECRET: string;
        JWT_REFRESH_SECRET: string;
        JWT_ACCESS_EXPIRES_IN: StringValue;
        JWT_REFRESH_EXPIRES_IN: StringValue;
        RESEND_API_KEY: string;
        EMAIL_FROM: string;
        APP_NAME: string;
        AWS_REGION: string;
        AWS_BUCKET_NAME: string;
        AWS_ACCESS_KEY_ID: string;
        AWS_SECRET_ACCESS_KEY: string;
        SYSTEM_USER_EMAIL: string;
        SYSTEM_USER_PASSWORD: string;
    }
}
