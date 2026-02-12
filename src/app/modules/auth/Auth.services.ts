import bcrypt from "bcrypt";
import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { Secret } from "jsonwebtoken";
import { db } from "../../../db";
import { companies, companyDomains, platforms, users, otp } from "../../../db/schema";
import config from "../../config";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { sendEmail } from "../../services/email.service";
import { tokenGenerator } from "../../utils/jwt-helpers";
import { ForgotPasswordPayload, LoginCredential, ResetPasswordPayload } from "./Auth.interfaces";
import { OTPGenerator } from "../../utils/helper";
import { emailTemplates } from "../../utils/email-templates";
import { OTPVerifier } from "../../utils/otp-verifier";
import { PERMISSIONS } from "../../constants/permissions";

const login = async (credential: LoginCredential, platformId: string) => {
    const { email, password } = credential;

    // Also filtering by platformId as requested
    const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, email), eq(users.platform_id, platformId)));

    if (!user) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "User not found");
    }

    if (
        !(
            user.permissions.includes(PERMISSIONS.AUTH_LOGIN) ||
            user.permissions.includes(PERMISSIONS.AUTH_ALL)
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
    const { password: _pass, ...userData } = user;

    const jwtPayload = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company_id: user.company_id,
        platform_id: user.platform_id,
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
        last_login_at: new Date(),
        access_token: accessToken,
        refresh_token: refreshToken,
    };
};

const getConfigByHostname = async (origin: string) => {
    const url = new URL(origin);
    const hostname = url.hostname;
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
            })
            .from(companyDomains)
            .innerJoin(companies, eq(companyDomains.company_id, companies.id))
            .where(eq(companyDomains.hostname, hostname))
            .limit(1);

        if (result) {
            const settings = result.settings as any;
            const branding = settings?.branding || {};

            return {
                platform_id: result.platform_id,
                company_id: result.company_id,
                company_name: result.company_name,
                logo_url: branding?.logo_url || null,
                primary_color: branding?.primary_color || null,
                secondary_color: branding?.secondary_color || null,
                currency: null,
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
            })
            .from(platforms)
            .where(eq(platforms.domain, url.host || url.href))
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
            };
        }

        const [result] = await db
            .select({
                platform_id: companyDomains.platform_id,
                company_id: companyDomains.company_id,
                company_name: companies.name,
                settings: companies.settings,
            })
            .from(companyDomains)
            .innerJoin(companies, eq(companyDomains.company_id, companies.id))
            .where(eq(companyDomains.hostname, url.host || url.href))
            .limit(1);

        if (result) {
            const settings = result.settings as any;
            const branding = settings?.branding || {};

            return {
                platform_id: result.platform_id,
                company_id: result.company_id,
                company_name: result.company_name,
                logo_url: branding?.logo_url || null,
                primary_color: branding?.primary_color || null,
                secondary_color: branding?.secondary_color || null,
                currency: null,
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

        // Step 2.3: Send OTP email
        await sendEmail({
            to: email,
            subject: `OTP for password reset`,
            html: emailTemplates.forgot_password_otp({
                email,
                otp: String(generatedOTP),
            }),
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
    getConfigByHostname,
    resetPassword,
    forgotPassword,
};
