import { eq } from "drizzle-orm";
import { Secret } from "jsonwebtoken";
import { db } from "../../db";
import { platforms } from "../../db/schema";
import config from "../config";
import { tokenGenerator, tokenVerifier } from "../utils/jwt-helpers";
import { EmailSuppressionService } from "./email-suppression.service";

type UnsubscribeTokenPayload = {
    type: "unsubscribe";
    email: string;
    platform_id: string;
};

const getUnsubscribeSecret = () =>
    (config.email_unsubscribe_secret || config.jwt_access_secret) as Secret;

const buildUnsubscribeToken = (platformId: string, email: string) =>
    tokenGenerator(
        {
            type: "unsubscribe",
            email: email.trim().toLowerCase(),
            platform_id: platformId,
        },
        getUnsubscribeSecret(),
        "365d"
    );

const verifyUnsubscribeToken = (token: string) =>
    tokenVerifier(token, getUnsubscribeSecret()) as UnsubscribeTokenPayload;

const buildUnsubscribeUrl = (platformId: string, email: string) => {
    const token = buildUnsubscribeToken(platformId, email);
    const baseUrl = (config.email_unsubscribe_base_url || config.server_url || "").replace(
        /\/$/,
        ""
    );

    if (!baseUrl) {
        return { token, url: "" };
    }

    return {
        token,
        url: `${baseUrl}/auth/unsubscribe?token=${encodeURIComponent(token)}`,
    };
};

const getPlatformEmailContext = async (platformId: string) => {
    const [platform] = await db
        .select({
            name: platforms.name,
            config: platforms.config,
        })
        .from(platforms)
        .where(eq(platforms.id, platformId))
        .limit(1);

    const configValue = (platform?.config || {}) as Record<string, unknown>;
    const fromEmail =
        (typeof configValue.from_email === "string" && configValue.from_email) ||
        config.email_from ||
        "no-reply@unconfigured.kadence.app";
    const supportEmail =
        (typeof configValue.support_email === "string" && configValue.support_email) ||
        config.email_reply_to ||
        fromEmail;

    return {
        platformName: platform?.name || config.app_name,
        fromEmail,
        supportEmail,
    };
};

const getUnsubscribeState = async (token: string) => {
    const payload = verifyUnsubscribeToken(token);
    const suppressed = await EmailSuppressionService.isSuppressed(
        payload.platform_id,
        payload.email
    );
    const platformContext = await getPlatformEmailContext(payload.platform_id);

    return {
        ...payload,
        suppressed,
        platformName: platformContext.platformName,
        supportEmail: platformContext.supportEmail,
    };
};

const unsubscribe = async (token: string) => {
    const payload = verifyUnsubscribeToken(token);
    const row = await EmailSuppressionService.suppress(payload.platform_id, payload.email);
    const platformContext = await getPlatformEmailContext(payload.platform_id);

    return {
        ...payload,
        suppression: row,
        platformName: platformContext.platformName,
        supportEmail: platformContext.supportEmail,
    };
};

export const EmailPreferencesService = {
    buildUnsubscribeToken,
    buildUnsubscribeUrl,
    verifyUnsubscribeToken,
    getPlatformEmailContext,
    getUnsubscribeState,
    unsubscribe,
};
