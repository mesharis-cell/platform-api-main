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

export const authSwagger = {};

