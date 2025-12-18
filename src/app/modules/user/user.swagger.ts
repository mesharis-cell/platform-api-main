/**
 * @swagger
 * /api/operations/v1/user:
 *   post:
 *     tags:
 *       - User Management
 *     summary: Create a new user
 *     description: Creates a new user account with role-based access control. The platform ID is automatically extracted from the X-Platform header. Email must be unique per platform.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               company:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: Company ID (required for CLIENT users, null for ADMIN/LOGISTICS)
 *                 example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: User's full name
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 255
 *                 description: User's email address (unique per platform)
 *                 example: "john.doe@example.com"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 50
 *                 description: User's password (will be hashed before storage)
 *                 example: "SecurePassword123!"
 *               role:
 *                 type: string
 *                 enum: [ADMIN, LOGISTICS, CLIENT]
 *                 default: CLIENT
 *                 description: User role for access control
 *                 example: "CLIENT"
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: string
 *                 default: []
 *                 description: Array of specific permissions granted to the user
 *                 example: ["orders.create", "orders.view", "assets.view"]
 *               permission_template:
 *                 type: string
 *                 enum: [PLATFORM_ADMIN, LOGISTICS_STAFF, CLIENT_USER]
 *                 nullable: true
 *                 description: Permission template to apply
 *                 example: "CLIENT_USER"
 *               isActive:
 *                 type: boolean
 *                 default: true
 *                 description: Whether the user account is active
 *                 example: true
 *     responses:
 *       201:
 *         description: User created successfully
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
 *                   example: "User created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: User unique identifier
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     platform:
 *                       type: string
 *                       format: uuid
 *                       description: Platform ID (from X-Platform header)
 *                       example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                     company:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       description: Company ID
 *                       example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                     name:
 *                       type: string
 *                       example: "John Doe"
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: "john.doe@example.com"
 *                     role:
 *                       type: string
 *                       enum: [ADMIN, LOGISTICS, CLIENT]
 *                       example: "CLIENT"
 *                     permissions:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["orders.create", "orders.view"]
 *                     permission_template:
 *                       type: string
 *                       nullable: true
 *                       example: "CLIENT_USER"
 *                     isActive:
 *                       type: boolean
 *                       example: true
 *                     lastLoginAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       description: Last login timestamp
 *                       example: null
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       description: User creation timestamp
 *                       example: "2025-12-19T02:30:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       description: User last update timestamp
 *                       example: "2025-12-19T02:30:00.000Z"
 *       400:
 *         description: Bad request - Validation error
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
 *                       example: "Validation failed"
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
 *         description: Unauthorized - Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Insufficient permissions
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
 *                       example: "Insufficient permissions to create users"
 *       409:
 *         description: Conflict - Email already exists for this platform
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
 *                       example: "EMAIL_EXISTS"
 *                     message:
 *                       type: string
 *                       example: "Email already exists for this platform"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *     security:
 *       - BearerAuth: []
 */
