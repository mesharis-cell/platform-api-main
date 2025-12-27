declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: "development" | "production" | "test";
    DATABASE_URL: string;
    PORT: string;
    SALT_ROUNDS: string;
    JWT_ACCESS_SECRET: string;
    JWT_REFRESH_SECRET: string;
    JWT_ACCESS_EXPIRES_IN: StringValue;
    JWT_REFRESH_EXPIRES_IN: StringValue;
    SMTP_HOST: string;
    SMTP_PORT: string;
    SMTP_USER: string;
    SMTP_PASS: string;
    EMAIL_FROM: string;
    APP_NAME: string;
  }
}
