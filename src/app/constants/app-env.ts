/**
 * Authoritative source for "which environment am I running in."
 *
 * APP_ENV is deployment-identity, distinct from Node's NODE_ENV. Every
 * deployment (local, testing, staging, production) MUST set APP_ENV
 * explicitly. No fallbacks, no defaults — misconfiguration fails loud
 * rather than silently picking an env.
 *
 * Add new envs here when provisioning one (e.g. a sandbox or preview env).
 * Nothing else should read process.env.APP_ENV directly — import getAppEnv()
 * or isProduction() here so validation stays centralized.
 */

export const APP_ENVS = ["production", "staging", "testing"] as const;

export type AppEnv = (typeof APP_ENVS)[number];

export const isAppEnv = (value: unknown): value is AppEnv =>
    typeof value === "string" && (APP_ENVS as readonly string[]).includes(value);

/**
 * Returns the current app env. Throws if APP_ENV is unset or not one of the
 * allowed values. Safe to call at request-time; inexpensive.
 */
export const getAppEnv = (): AppEnv => {
    const raw = (process.env.APP_ENV ?? "").trim().toLowerCase();
    if (!isAppEnv(raw)) {
        throw new Error(
            `APP_ENV must be set to one of: ${APP_ENVS.join(", ")}. ` +
                `Got: ${JSON.stringify(process.env.APP_ENV ?? "<unset>")}.`
        );
    }
    return raw;
};

export const isProduction = (): boolean => getAppEnv() === "production";
export const isStaging = (): boolean => getAppEnv() === "staging";
export const isTesting = (): boolean => getAppEnv() === "testing";
