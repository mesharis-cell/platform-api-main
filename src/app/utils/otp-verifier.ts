import { and, eq } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../db";
import { otp } from "../../db/schema";
import CustomizedError from "../error/customized-error";

export const OTPVerifier = async (platformId: string, otpCode: string, email: string) => {
    // Step 1: Find OTP record in database
    const [storedOTP] = await db
        .select()
        .from(otp)
        .where(
            and(
                eq(otp.otp, otpCode),
                eq(otp.email, email),
                eq(otp.platform_id, platformId)
            )
        )
        .limit(1);

    if (!storedOTP) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "OTP not matched");
    }

    // Step 2: Check if OTP has expired
    const currentTime = new Date();
    const expirationTime = new Date(storedOTP.expires_at);

    if (currentTime > expirationTime) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "OTP has expired");
    }

    // Step 3: Verify OTP matches
    if (otpCode === storedOTP.otp) {
        // Step 4: Delete the used OTP
        await db
            .delete(otp)
            .where(
                and(
                    eq(otp.otp, otpCode),
                    eq(otp.email, email),
                    eq(otp.platform_id, platformId)
                )
            );

        return storedOTP;
    } else {
        throw new CustomizedError(httpStatus.FORBIDDEN, "Invalid OTP");
    }
};
