import bcrypt from "bcrypt";
import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { Secret } from "jsonwebtoken";
import { db } from "../../../db";
import { companies, companyDomains, platforms, users, otp } from "../../../db/schema";
import config from "../../config";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { computeEffectivePermissions } from "../../utils/access-policy";
import { tokenGenerator, tokenVerifier } from "../../utils/jwt-helpers";
import {
    ForgotPasswordPayload,
    LoginCredential,
    RefreshTokenPayload,
    ResetPasswordPayload,
} from "./Auth.interfaces";
import { OTPGenerator } from "../../utils/helper";
import { eventBus, EVENT_TYPES } from "../../events";
import { OTPVerifier } from "../../utils/otp-verifier";
import { PERMISSIONS } from "../../constants/permissions";

const sanitizePlatformFeatures = (features: unknown): Record<string, boolean> => {
    const raw = (features || {}) as Record<string, unknown>;
    return {
        enable_inbound_requests:
            raw.enable_inbound_requests === undefined ? true : Boolean(raw.enable_inbound_requests),
        show_estimate_on_order_creation:
            raw.show_estimate_on_order_creation === undefined
                ? true
                : Boolean(raw.show_estimate_on_order_creation),
        require_client_po_number_on_quote_approval:
            raw.require_client_po_number_on_quote_approval === undefined
                ? true
                : Boolean(raw.require_client_po_number_on_quote_approval),
        enable_kadence_invoicing:
            raw.enable_kadence_invoicing === undefined
                ? false
                : Boolean(raw.enable_kadence_invoicing),
        enable_base_operations:
            raw.enable_base_operations === undefined ? true : Boolean(raw.enable_base_operations),
        enable_asset_bulk_upload:
            raw.enable_asset_bulk_upload === undefined
                ? false
                : Boolean(raw.enable_asset_bulk_upload),
        enable_attachments:
            raw.enable_attachments === undefined ? true : Boolean(raw.enable_attachments),
        enable_workflows: raw.enable_workflows === undefined ? true : Boolean(raw.enable_workflows),
    };
};

const sanitizeCompanyFeatureOverrides = (features: unknown): Partial<Record<string, boolean>> => {
    const raw = (features || {}) as Record<string, unknown>;
    const overrides: Partial<Record<string, boolean>> = {};

    if (raw.enable_inbound_requests !== undefined) {
        overrides.enable_inbound_requests = Boolean(raw.enable_inbound_requests);
    }
    if (raw.show_estimate_on_order_creation !== undefined) {
        overrides.show_estimate_on_order_creation = Boolean(raw.show_estimate_on_order_creation);
    }
    if (raw.require_client_po_number_on_quote_approval !== undefined) {
        overrides.require_client_po_number_on_quote_approval = Boolean(
            raw.require_client_po_number_on_quote_approval
        );
    }
    if (raw.enable_kadence_invoicing !== undefined) {
        overrides.enable_kadence_invoicing = Boolean(raw.enable_kadence_invoicing);
    }
    if (raw.enable_base_operations !== undefined) {
        overrides.enable_base_operations = Boolean(raw.enable_base_operations);
    }
    if (raw.enable_asset_bulk_upload !== undefined) {
        overrides.enable_asset_bulk_upload = Boolean(raw.enable_asset_bulk_upload);
    }
    if (raw.enable_attachments !== undefined) {
        overrides.enable_attachments = Boolean(raw.enable_attachments);
    }
    if (raw.enable_workflows !== undefined) {
        overrides.enable_workflows = Boolean(raw.enable_workflows);
    }

    return overrides;
};

const login = async (credential: LoginCredential, platformId: string) => {
    const { email, password } = credential;

    // Also filtering by platformId as requested
    const user = await db.query.users.findFirst({
        where: and(eq(users.email, email), eq(users.platform_id, platformId)),
        with: {
            access_policy: {
                columns: {
                    permissions: true,
                },
            },
        },
    });

    if (!user) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "User not found");
    }

    const effectivePermissions = computeEffectivePermissions({
        accessPolicyPermissions: user.access_policy?.permissions,
        permissionGrants: user.permission_grants,
        permissionRevokes: user.permission_revokes,
        legacyPermissions: user.permissions,
    });

    if (
        !(
            effectivePermissions.includes(PERMISSIONS.AUTH_LOGIN) ||
            effectivePermissions.includes(PERMISSIONS.AUTH_ALL)
        )
    ) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "You are not authorized to login");
    }

    if (!user.is_active) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "User account is not active");
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
        throw new CustomizedError(httpStatus.UNAUTHORIZED, "Invalid password");
    }

    // Remove password from response
    const { password: _pass, access_policy: _accessPolicy, ...userData } = user as any;

    const jwtPayload = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        platform_id: user.platform_id,
        is_super_admin: user.is_super_admin,
    };

    const accessToken = tokenGenerator(
        jwtPayload,
        config.jwt_access_secret as Secret,
        config.jwt_access_expires_in
    );

    const refreshToken = tokenGenerator(
        jwtPayload,
        config.jwt_refresh_secret as Secret,
        config.jwt_refresh_expires_in
    );

    if (accessToken && refreshToken) {
        await db
            .update(users)
            .set({
                last_login_at: new Date(),
            })
            .where(eq(users.id, user.id));
    }

    return {
        ...userData,
        permissions: effectivePermissions,
        effective_permissions: effectivePermissions,
        last_login_at: new Date(),
        access_token: accessToken,
        refresh_token: refreshToken,
    };
};

const refresh = async (payload: RefreshTokenPayload) => {
    const { refresh_token } = payload;

    let verifiedUser: AuthUser;
    try {
        verifiedUser = tokenVerifier(
            refresh_token,
            config.jwt_refresh_secret as Secret
        ) as AuthUser;
    } catch {
        throw new CustomizedError(httpStatus.UNAUTHORIZED, "Invalid or expired refresh token");
    }

    if (!verifiedUser?.id || !verifiedUser?.platform_id) {
        throw new CustomizedError(httpStatus.UNAUTHORIZED, "Invalid refresh token payload");
    }

    const user = await db.query.users.findFirst({
        where: and(
            eq(users.id, verifiedUser.id),
            eq(users.platform_id, verifiedUser.platform_id),
            eq(users.is_active, true)
        ),
    });

    if (!user) {
        throw new CustomizedError(httpStatus.UNAUTHORIZED, "User not found or inactive");
    }

    const jwtPayload = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        platform_id: user.platform_id,
        is_super_admin: user.is_super_admin,
    };

    const accessToken = tokenGenerator(
        jwtPayload,
        config.jwt_access_secret as Secret,
        config.jwt_access_expires_in
    );

    const refreshToken = tokenGenerator(
        jwtPayload,
        config.jwt_refresh_secret as Secret,
        config.jwt_refresh_expires_in
    );

    return {
        access_token: accessToken,
        refresh_token: refreshToken,
    };
};

const ENV_PREFIXES = new Set(["staging", "dev", "preview", "test"]);

/** Strip a leading env prefix so staging.admin.kadence.ae → admin.kadence.ae */
const normalizeHostname = (hostname: string): string => {
    const parts = hostname.split(".");
    if (parts.length > 2 && ENV_PREFIXES.has(parts[0])) return parts.slice(1).join(".");
    return hostname;
};

const parseIncomingHostname = (originOrHost?: string | null): string => {
    const raw = String(originOrHost || "")
        .split(",")[0]
        ?.trim()
        .toLowerCase();
    if (!raw) return "";

    const candidate = raw.includes("://") ? raw : `https://${raw}`;
    try {
        return new URL(candidate).hostname.toLowerCase();
    } catch {
        return raw
            .replace(/^https?:\/\//, "")
            .split("/")[0]
            .split(":")[0]
            .toLowerCase();
    }
};

const getConfigByHostname = async (originOrHost?: string | null) => {
    const parsedHostname = parseIncomingHostname(originOrHost);
    if (!parsedHostname) return null;

    const hostname = normalizeHostname(parsedHostname);
    const subdomain = hostname.split(".")[0];

    // Production environment
    if (config.node_env === "production") {
        // Step 1: Check if sub domain is admin or warehouse
        if (subdomain === "admin" || subdomain === "warehouse") {
            const rootDomain = hostname.split(".").slice(1).join(".");

            // Step 2: Return platform config
            const [platform] = await db
                .select({
                    id: platforms.id,
                    name: platforms.name,
                    config: platforms.config,
                    features: platforms.features,
                })
                .from(platforms)
                .where(eq(platforms.domain, rootDomain))
                .limit(1);

            if (platform) {
                const config = platform.config as any;
                return {
                    platform_name: platform.name,
                    platform_id: platform.id,
                    company_id: null,
                    company_name: null,
                    logo_url: config?.logo_url || null,
                    primary_color: config?.primary_color || null,
                    secondary_color: config?.secondary_color || null,
                    currency: config?.currency || null,
                    features: sanitizePlatformFeatures(platform.features),
                };
            }
            return null;
        }

        // Step 3: If it's not admin or warehouse, it's a company domain
        const [result] = await db
            .select({
                platform_id: companyDomains.platform_id,
                company_id: companyDomains.company_id,
                company_name: companies.name,
                settings: companies.settings,
                company_features: companies.features,
                platform_features: platforms.features,
            })
            .from(companyDomains)
            .innerJoin(companies, eq(companyDomains.company_id, companies.id))
            .innerJoin(platforms, eq(companyDomains.platform_id, platforms.id))
            .where(and(eq(companyDomains.hostname, hostname), eq(companyDomains.is_active, true)))
            .limit(1);

        if (result) {
            const settings = result.settings as any;
            const branding = settings?.branding || {};
            const platformFeatures = sanitizePlatformFeatures(result.platform_features);
            const companyFeatures = sanitizeCompanyFeatureOverrides(result.company_features);

            return {
                platform_id: result.platform_id,
                company_id: result.company_id,
                company_name: result.company_name,
                logo_url: branding?.logo_url || null,
                primary_color: branding?.primary_color || null,
                secondary_color: branding?.secondary_color || null,
                currency: null,
                features: { ...platformFeatures, ...companyFeatures },
                platform_features: platformFeatures,
                company_features: companyFeatures,
            };
        }

        return null;
    } else {
        // Check if it in platform if yes return platform if not than check in company domain and return
        const [platform] = await db
            .select({
                id: platforms.id,
                name: platforms.name,
                config: platforms.config,
                features: platforms.features,
            })
            .from(platforms)
            .where(eq(platforms.domain, hostname))
            .limit(1);

        if (platform) {
            const config = platform.config as any;
            return {
                platform_id: platform.id,
                platform_name: platform.name,
                company_id: null,
                company_name: null,
                logo_url: config?.logo_url || null,
                primary_color: config?.primary_color || null,
                secondary_color: config?.secondary_color || null,
                currency: config?.currency || null,
                features: sanitizePlatformFeatures(platform.features),
            };
        }

        const [result] = await db
            .select({
                platform_id: companyDomains.platform_id,
                company_id: companyDomains.company_id,
                company_name: companies.name,
                settings: companies.settings,
                company_features: companies.features,
                platform_features: platforms.features,
            })
            .from(companyDomains)
            .innerJoin(companies, eq(companyDomains.company_id, companies.id))
            .innerJoin(platforms, eq(companyDomains.platform_id, platforms.id))
            .where(and(eq(companyDomains.hostname, hostname), eq(companyDomains.is_active, true)))
            .limit(1);

        if (result) {
            const settings = result.settings as any;
            const branding = settings?.branding || {};
            const platformFeatures = sanitizePlatformFeatures(result.platform_features);
            const companyFeatures = sanitizeCompanyFeatureOverrides(result.company_features);

            return {
                platform_id: result.platform_id,
                company_id: result.company_id,
                company_name: result.company_name,
                logo_url: branding?.logo_url || null,
                primary_color: branding?.primary_color || null,
                secondary_color: branding?.secondary_color || null,
                currency: null,
                features: { ...platformFeatures, ...companyFeatures },
                platform_features: platformFeatures,
                company_features: companyFeatures,
            };
        }

        return null;
    }
};

// const getConfigByHostname = async (origin: string) => {
//     const url = new URL(origin);
//     const hostname = url.hostname;

//     /**
//      * CONFIGURATION
//      * PLATFORM_ROOT: The domain name stored in your 'platforms' table.
//      * AMPLIFY_MAPPING: Maps the unique AWS hash to the app's functional role.
//      */
//     const PLATFORM_ROOT = "my-saas-app.com";

//     const AMPLIFY_MAPPING: Record<string, "admin" | "warehouse" | "client"> = {
//         "d24txteqyd3gxb": "admin",
//         "da9589fgr2awj": "warehouse",
//         "d2xpl5tyv9gv2p": "client",
//     };

//     // 1. Detect if we are on an Amplify staging domain
//     const amplifyKey = Object.keys(AMPLIFY_MAPPING).find(key => hostname.includes(key));

//     // 2. Set "Effective" values to normalize logic between Normal and Amplify domains
//     let effectiveSubdomain = hostname.split(".")[0];
//     let effectiveRootDomain = hostname.split(".").slice(1).join(".");

//     if (amplifyKey) {
//         effectiveSubdomain = AMPLIFY_MAPPING[amplifyKey];
//         // Force the root domain to match your DB record for Admin/Warehouse lookups
//         effectiveRootDomain = PLATFORM_ROOT;
//     }

//     // 3. Main Logic Execution
//     if (config.node_env === "production" || amplifyKey) {

//         // CASE A: ADMIN or WAREHOUSE (Platform Level)
//         if (effectiveSubdomain === "admin" || effectiveSubdomain === "warehouse") {
//             const [platform] = await db
//                 .select({
//                     id: platforms.id,
//                     name: platforms.name,
//                     config: platforms.config,
//                 })
//                 .from(platforms)
//                 .where(eq(platforms.domain, effectiveRootDomain))
//                 .limit(1);

//             if (platform) {
//                 const cfg = platform.config as any;
//                 return {
//                     platform_name: platform.name,
//                     platform_id: platform.id,
//                     company_id: null,
//                     company_name: null,
//                     logo_url: cfg?.logo_url || null,
//                     primary_color: cfg?.primary_color || null,
//                     secondary_color: cfg?.secondary_color || null,
//                     currency: cfg?.currency || null,
//                 };
//             }
//             return null;
//         }

//         // CASE B: CLIENT / COMPANY DOMAINS
//         // We use the literal 'hostname' here because your companyDomains table
//         // should contain the specific domain (e.g., client.domain.com or the Amplify URL)
//         const [result] = await db
//             .select({
//                 platform_id: companyDomains.platform_id,
//                 company_id: companyDomains.company_id,
//                 company_name: companies.name,
//                 settings: companies.settings,
//             })
//             .from(companyDomains)
//             .innerJoin(companies, eq(companyDomains.company_id, companies.id))
//             .where(eq(companyDomains.hostname, hostname))
//             .limit(1);

//         if (result) {
//             const settings = result.settings as any;
//             const branding = settings?.branding || {};

//             return {
//                 platform_id: result.platform_id,
//                 company_id: result.company_id,
//                 company_name: result.company_name,
//                 logo_url: branding?.logo_url || null,
//                 primary_color: branding?.primary_color || null,
//                 secondary_color: branding?.secondary_color || null,
//                 currency: null,
//             };
//         }

//         return null;

//     } else {
//         // CASE C: LOCAL DEVELOPMENT FALLBACK
//         // Standard check for localhost or internal dev hostnames
//         const [platform] = await db
//             .select({
//                 id: platforms.id,
//                 name: platforms.name,
//                 config: platforms.config,
//             })
//             .from(platforms)
//             .where(eq(platforms.domain, hostname))
//             .limit(1);

//         if (platform) {
//             const cfg = platform.config as any;
//             return {
//                 platform_id: platform.id,
//                 platform_name: platform.name,
//                 company_id: null,
//                 company_name: null,
//                 logo_url: cfg?.logo_url || null,
//                 primary_color: cfg?.primary_color || null,
//                 secondary_color: cfg?.secondary_color || null,
//                 currency: cfg?.currency || null,
//             };
//         }

//         const [result] = await db
//             .select({
//                 platform_id: companyDomains.platform_id,
//                 company_id: companyDomains.company_id,
//                 company_name: companies.name,
//                 settings: companies.settings,
//             })
//             .from(companyDomains)
//             .innerJoin(companies, eq(companyDomains.company_id, companies.id))
//             .where(eq(companyDomains.hostname, hostname))
//             .limit(1);

//         if (result) {
//             const settings = result.settings as any;
//             const branding = settings?.branding || {};

//             return {
//                 platform_id: result.platform_id,
//                 company_id: result.company_id,
//                 company_name: result.company_name,
//                 logo_url: branding?.logo_url || null,
//                 primary_color: branding?.primary_color || null,
//                 secondary_color: branding?.secondary_color || null,
//                 currency: null,
//             };
//         }

//         return null;
//     }
// };

const resetPassword = async (
    platformId: string,
    authUser: AuthUser,
    payload: ResetPasswordPayload
) => {
    const { current_password, new_password } = payload;

    // Step 1: Find user by email and platform
    const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, authUser.id), eq(users.platform_id, platformId)));

    if (!user) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "User not found");
    }

    if (!user.is_active) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "User account is not active");
    }

    // Step 2: Verify current password
    const isPasswordMatch = await bcrypt.compare(current_password, user.password);

    if (!isPasswordMatch) {
        throw new CustomizedError(httpStatus.UNAUTHORIZED, "Current password is incorrect");
    }

    // Step 3: Check if new password is same as current password
    const isSamePassword = await bcrypt.compare(new_password, user.password);

    if (isSamePassword) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "New password cannot be the same as current password"
        );
    }

    // Step 4: Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 12);

    // Step 5: Update password in database
    await db
        .update(users)
        .set({
            password: hashedPassword,
            updated_at: new Date(),
        })
        .where(eq(users.id, user.id));

    // Remove password from response
    const { password: _pass, ...userData } = user;

    return userData;
};

const forgotPassword = async (platformId: string, payload: ForgotPasswordPayload) => {
    // Step 1: Validate payload structure
    const { email, otp: inputOtp, new_password } = payload;

    if (inputOtp && !new_password) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "New password is required");
    }

    // Step 2: Handle OTP generation and sending
    if (email && !inputOtp) {
        // Step 2.1: Check if the user exists and is active
        const [user] = await db
            .select()
            .from(users)
            .where(
                and(
                    eq(users.email, email),
                    eq(users.platform_id, platformId),
                    eq(users.is_active, true)
                )
            );

        if (!user) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Invalid email or user is not active");
        }

        // Step 2.2: Generate OTP and expiration time
        const generatedOTP = OTPGenerator();
        const expirationTime = new Date(new Date().getTime() + 5 * 60000);

        // Step 2.3: Emit auth.password_reset_requested event
        await eventBus.emit({
            platform_id: platformId,
            event_type: EVENT_TYPES.AUTH_PASSWORD_RESET_REQUESTED,
            entity_type: "USER",
            entity_id: user.id,
            actor_id: null,
            actor_role: null,
            payload: {
                email,
                otp: String(generatedOTP),
            },
        });

        // Step 2.4: Save OTP record in the database
        const [createdOtp] = await db
            .insert(otp)
            .values({
                platform_id: platformId,
                email,
                otp: String(generatedOTP),
                expires_at: expirationTime,
            })
            .returning();

        return {
            message: "OTP sent successfully",
            data: {
                email: createdOtp.email,
                expires_at: createdOtp.expires_at,
            },
        };
    }

    // Step 3: Handle password reset using OTP
    if (email && inputOtp && new_password) {
        // Step 3.1: Verify OTP from database
        await OTPVerifier(platformId, String(inputOtp), email);

        // Step 3.2: Hash new password
        const hashedPassword = await bcrypt.hash(new_password, Number(config.salt_rounds));

        // Step 3.3: Update user password
        await db
            .update(users)
            .set({
                password: hashedPassword,
                updated_at: new Date(),
            })
            .where(and(eq(users.email, email), eq(users.platform_id, platformId)));

        return {
            message: "Password reset successfully",
            data: null,
        };
    }

    // Step 4: Handle invalid request cases
    throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid request");
};

export const AuthServices = {
    login,
    refresh,
    getConfigByHostname,
    resetPassword,
    forgotPassword,
};
