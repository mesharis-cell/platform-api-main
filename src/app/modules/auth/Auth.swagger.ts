/**
 * @swagger
 * /api/auth/context:
 *   get:
 *     tags:
 *       - Authentication
 *     summary: Get platform context by hostname
 *     description: Retrieves platform information based on the hostname. This endpoint is used to identify which platform a frontend application belongs to before login.
 *     parameters:
 *       - in: query
 *         name: hostname
 *         required: true
 *         schema:
 *           type: string
 *         description: The hostname of the platform domain
 *         example: "demo.pmg-platform.com"
 *     responses:
 *       200:
 *         description: Platform context retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Platform fetched successfully"
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   description: Returns null if hostname is not found
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Platform unique identifier
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     config:
 *                       type: object
 *                       description: Platform configuration settings
 *                       properties:
 *                         logo_url:
 *                           type: string
 *                           nullable: true
 *                           description: URL to the platform logo
 *                           example: "https://example.com/logo.png"
 *                         primary_color:
 *                           type: string
 *                           nullable: true
 *                           description: Primary theme color (hex)
 *                           example: "#3B82F6"
 *                         secondary_color:
 *                           type: string
 *                           nullable: true
 *                           description: Secondary/fallback theme color (hex)
 *                           example: "#10B981"
 *                         logistics_partner_name:
 *                           type: string
 *                           nullable: true
 *                           description: Name of the logistics partner
 *                           example: "A2 Logistics"
 *                         support_email:
 *                           type: string
 *                           format: email
 *                           nullable: true
 *                           description: Support email address
 *                           example: "support@platform.com"
 *                         currency:
 *                           type: string
 *                           nullable: true
 *                           description: Default currency code
 *                           example: "AED"
 *       400:
 *         description: Bad request - Hostname is required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "BAD_REQUEST"
 *                     message:
 *                       type: string
 *                       example: "Hostname is required"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: User login
 *     description: |
 *       Authenticates a user with email and password. On successful login, sets HTTP-only cookies for access_token and refresh_token.
 *       The platform ID is required in the X-Platform header to identify which platform the user belongs to.
 *
 *       **Cookie Details:**
 *       - `access_token`: Short-lived JWT for API authentication
 *       - `refresh_token`: Long-lived JWT for obtaining new access tokens
 *
 *       Both cookies are HTTP-only and have their expiry synced with the JWT expiration.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address (unique per platform)
 *                 example: "john.doe@example.com"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: User's password
 *                 example: "SecurePass@123"
 *     responses:
 *       200:
 *         description: Login successful. Tokens are set as HTTP-only cookies.
 *         headers:
 *           Set-Cookie:
 *             description: |
 *               Sets access_token and refresh_token cookies
 *             schema:
 *               type: string
 *               example: "access_token=eyJhbG...; HttpOnly; Secure; SameSite=Strict; Max-Age=86400"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User logged in successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: User unique identifier
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       description: Platform ID
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       description: Company ID (null for ADMIN/LOGISTICS users)
 *                       example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                     name:
 *                       type: string
 *                       description: User's full name
 *                       example: "John Doe"
 *                     email:
 *                       type: string
 *                       format: email
 *                       description: User's email address
 *                       example: "john.doe@example.com"
 *                     role:
 *                       type: string
 *                       enum: [ADMIN, LOGISTICS, CLIENT]
 *                       description: User role
 *                       example: "CLIENT"
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Array of user permissions
 *                       example: ["orders.create", "orders.view", "assets.view"]
 *                     permission_template:
 *                       type: string
 *                       nullable: true
 *                       description: Permission template applied to user
 *                       example: "CLIENT_USER"
 *                     is_active:
 *                       type: boolean
 *                       description: Whether the user account is active
 *                       example: true
 *                     last_login_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       description: Last login timestamp
 *                       example: "2025-12-22T10:30:00.000Z"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       description: Account creation timestamp
 *                       example: "2025-12-19T02:30:00.000Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       description: Account last update timestamp
 *                       example: "2025-12-22T10:30:00.000Z"
 *       400:
 *         description: Bad request - Validation error or missing X-Platform header
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "VALIDATION_ERROR"
 *                     message:
 *                       type: string
 *                       example: "x-platform-id header is required"
 *                     details:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           field:
 *                             type: string
 *                             example: "email"
 *                           message:
 *                             type: string
 *                             example: "Invalid email address"
 *       401:
 *         description: Unauthorized - Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "UNAUTHORIZED"
 *                     message:
 *                       type: string
 *                       example: "Invalid password"
 *       403:
 *         description: Forbidden - User account is not active
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "FORBIDDEN"
 *                     message:
 *                       type: string
 *                       example: "User account is not active"
 *       404:
 *         description: Not found - User does not exist
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     message:
 *                       type: string
 *                       example: "User not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: User logout
 *     description: |
 *       Logs out the current user by clearing the access_token and refresh_token cookies.
 *       This endpoint does not require authentication as it simply clears the cookies.
 *     responses:
 *       200:
 *         description: Logout successful. Cookies are cleared.
 *         headers:
 *           Set-Cookie:
 *             description: Clears access_token and refresh_token cookies
 *             schema:
 *               type: string
 *               example: "access_token=; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User logged out successfully"
 *                 data:
 *                   type: "null"
 *                   example: null
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Reset user password
 *     description: |
 *       Allows an authenticated user to reset their own password by providing their current password and new password.
 *       The user must be logged in and provide a valid access token. The platform ID is required in the X-Platform header.
 *
 *       **Security Features:**
 *       - Requires authentication (user must be logged in)
 *       - Verifies current password before allowing reset
 *       - Prevents setting new password same as current password
 *       - Validates new password strength (minimum 8 characters)
 *       - Only active users can reset their password
 *       - User can only reset their own password
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - current_password
 *               - new_password
 *             properties:
 *               current_password:
 *                 type: string
 *                 description: User's current password
 *                 example: "OldPassword@123"
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 50
 *                 description: New password (must be at least 8 characters)
 *                 example: "NewSecurePass@456"
 *     responses:
 *       200:
 *         description: Password reset successful. Returns updated user data without password.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Password reset successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: User unique identifier
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       description: Platform ID
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       description: Company ID (null for ADMIN/LOGISTICS users)
 *                       example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                     name:
 *                       type: string
 *                       description: User's full name
 *                       example: "John Doe"
 *                     email:
 *                       type: string
 *                       format: email
 *                       description: User's email address
 *                       example: "john.doe@example.com"
 *                     role:
 *                       type: string
 *                       enum: [ADMIN, LOGISTICS, CLIENT]
 *                       description: User role
 *                       example: "CLIENT"
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Array of user permissions
 *                       example: ["orders.create", "orders.view", "assets.view"]
 *                     permission_template:
 *                       type: string
 *                       nullable: true
 *                       description: Permission template applied to user
 *                       example: "CLIENT_USER"
 *                     is_active:
 *                       type: boolean
 *                       description: Whether the user account is active
 *                       example: true
 *                     last_login_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       description: Last login timestamp
 *                       example: "2025-12-22T10:30:00.000Z"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       description: Account creation timestamp
 *                       example: "2025-12-19T02:30:00.000Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       description: Account last update timestamp
 *                       example: "2026-01-09T01:12:00.000Z"
 *       400:
 *         description: Bad request - Validation error, missing X-Platform header, or new password same as current
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "BAD_REQUEST"
 *                     message:
 *                       type: string
 *                       example: "New password cannot be the same as current password"
 *                     details:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           field:
 *                             type: string
 *                             example: "new_password"
 *                           message:
 *                             type: string
 *                             example: "New password must be at least 8 characters"
 *       401:
 *         description: Unauthorized - Not authenticated, invalid token, or current password is incorrect
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "UNAUTHORIZED"
 *                     message:
 *                       type: string
 *                       example: "Current password is incorrect"
 *       403:
 *         description: Forbidden - User account is not active
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "FORBIDDEN"
 *                     message:
 *                       type: string
 *                       example: "User account is not active"
 *       404:
 *         description: Not found - User does not exist
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     message:
 *                       type: string
 *                       example: "User not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Forgot password - OTP-based password reset
 *     description: |
 *       Two-step password reset process using OTP (One-Time Password):
 *
 *       **Step 1: Request OTP**
 *       - Send only `email` in the request body
 *       - System generates a 6-digit OTP valid for 5 minutes
 *       - OTP is sent to the user's email address
 *       - Returns OTP details (email and expiration time)
 *
 *       **Step 2: Reset Password with OTP**
 *       - Send `email`, `otp`, and `new_password` in the request body
 *       - System verifies OTP validity and expiration
 *       - Updates user password if OTP is valid
 *       - Deletes used OTP from database
 *
 *       **Security Features:**
 *       - OTP expires after 5 minutes
 *       - OTP is single-use (deleted after successful reset)
 *       - Only active users can request OTP
 *       - Platform-scoped (multi-tenant support)
 *       - Password hashed with bcrypt
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *                 example: "john.doe@example.com"
 *               otp:
 *                 type: number
 *                 description: 6-digit OTP code (required for Step 2)
 *                 example: 123456
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 50
 *                 description: New password (required for Step 2, must be at least 8 characters)
 *                 example: "NewSecurePass@456"
 *           examples:
 *             requestOTP:
 *               summary: Step 1 - Request OTP
 *               value:
 *                 email: "john.doe@example.com"
 *             resetPassword:
 *               summary: Step 2 - Reset Password with OTP
 *               value:
 *                 email: "john.doe@example.com"
 *                 otp: 123456
 *                 new_password: "NewSecurePass@456"
 *     responses:
 *       200:
 *         description: Success - OTP sent or password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   nullable: true
 *             examples:
 *               otpSent:
 *                 summary: Step 1 Response - OTP Sent
 *                 value:
 *                   success: true
 *                   message: "OTP sent successfully"
 *                   data:
 *                     email: "john.doe@example.com"
 *                     expires_at: "2026-01-09T14:50:00.000Z"
 *               passwordReset:
 *                 summary: Step 2 Response - Password Reset
 *                 value:
 *                   success: true
 *                   message: "Password reset successfully"
 *                   data: null
 *       400:
 *         description: Bad request - Validation error, missing X-Platform header, or invalid request structure
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "BAD_REQUEST"
 *                     message:
 *                       type: string
 *                     details:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           field:
 *                             type: string
 *                           message:
 *                             type: string
 *             examples:
 *               invalidEmail:
 *                 summary: Invalid email format
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "VALIDATION_ERROR"
 *                     message: "Invalid email address"
 *               missingPassword:
 *                 summary: OTP provided without new password
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "BAD_REQUEST"
 *                     message: "New password is required"
 *               invalidRequest:
 *                 summary: Invalid request structure
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "BAD_REQUEST"
 *                     message: "Invalid request"
 *       403:
 *         description: Forbidden - Invalid OTP, expired OTP, or OTP not matched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "FORBIDDEN"
 *                     message:
 *                       type: string
 *             examples:
 *               otpNotMatched:
 *                 summary: OTP does not match
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "FORBIDDEN"
 *                     message: "OTP not matched"
 *               otpExpired:
 *                 summary: OTP has expired
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "FORBIDDEN"
 *                     message: "OTP has expired"
 *               invalidOTP:
 *                 summary: Invalid OTP code
 *                 value:
 *                   success: false
 *                   error:
 *                     code: "FORBIDDEN"
 *                     message: "Invalid OTP"
 *       404:
 *         description: Not found - User does not exist or is not active
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NOT_FOUND"
 *                     message:
 *                       type: string
 *                       example: "Invalid email or user is not active"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/auth/reset-password-with-token:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Reset password with token
 *     description: |
 *       Resets user password using the token received via email.
 *       The platform ID is required in the X-Platform header to identify which platform the user belongs to.
 *
 *       **Security Features:**
 *       - Validates reset token and expiration (1 hour validity)
 *       - Hashes new password with bcrypt
 *       - Clears reset token after successful reset
 *       - Validates new password strength (minimum 8 characters)
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - new_password
 *             properties:
 *               token:
 *                 type: string
 *                 description: Reset token received via email
 *                 example: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6"
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 50
 *                 description: New password (must be at least 8 characters)
 *                 example: "NewSecurePass@456"
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Password has been reset successfully. You can now login with your new password."
 *                 data:
 *                   type: "null"
 *                   example: null
 *       400:
 *         description: Bad request - Invalid/expired token, validation error, or missing X-Platform header
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "BAD_REQUEST"
 *                     message:
 *                       type: string
 *                       example: "Invalid or expired reset token"
 *                     details:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           field:
 *                             type: string
 *                             example: "new_password"
 *                           message:
 *                             type: string
 *                             example: "New password must be at least 8 characters"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

export const authSwagger = {};
