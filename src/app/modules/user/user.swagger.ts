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
 *                 example: "c7dbfc23-c782-4004-9492-755ceb0cc33a"
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: User's full name
 *                 example: "fazly"
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 255
 *                 description: User's email address (unique per platform)
 *                 example: "fazlyalahi.ru@gmail.com"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 maxLength: 50
 *                 description: User's password (will be hashed before storage)
 *                 example: "Nahid@123"
 *               role:
 *                 type: string
 *                 enum: [ADMIN, LOGISTICS, CLIENT]
 *                 default: CLIENT
 *                 description: User role for access control
 *                 example: "ADMIN"
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
 *                 example: "PLATFORM_ADMIN"
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
 *   get:
 *     tags:
 *       - User Management
 *     summary: Get all users
 *     description: Retrieves a paginated list of users for the platform. Supports filtering by role, status, company, search term, and date range. Requires ADMIN role authentication.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: page
 *         in: query
 *         description: Page number for pagination
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *           example: 1
 *       - name: limit
 *         in: query
 *         description: Number of items per page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *           example: 10
 *       - name: search_term
 *         in: query
 *         description: Search term to filter users by name or email (case-insensitive)
 *         required: false
 *         schema:
 *           type: string
 *           example: "john"
 *       - name: role
 *         in: query
 *         description: Filter by user role (comma-separated for multiple roles)
 *         required: false
 *         schema:
 *           type: string
 *           enum: [ADMIN, LOGISTICS, CLIENT]
 *           example: "ADMIN,CLIENT"
 *       - name: isActive
 *         in: query
 *         description: Filter by active status
 *         required: false
 *         schema:
 *           type: string
 *           enum: ["true", "false"]
 *           example: "true"
 *       - name: company
 *         in: query
 *         description: Filter by company ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *       - name: sort_by
 *         in: query
 *         description: Field to sort by
 *         required: false
 *         schema:
 *           type: string
 *           enum: [id, name, email, role, createdAt, updatedAt]
 *           default: createdAt
 *           example: "createdAt"
 *       - name: sort_order
 *         in: query
 *         description: Sort order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *           example: "desc"
 *       - name: from_date
 *         in: query
 *         description: Filter users created from this date (ISO 8601 format)
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *           example: "2025-01-01T00:00:00.000Z"
 *       - name: to_date
 *         in: query
 *         description: Filter users created until this date (ISO 8601 format)
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *           example: "2025-12-31T23:59:59.999Z"
 *     responses:
 *       200:
 *         description: Users retrieved successfully
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
 *                   example: "Users fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     meta:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                           example: 1
 *                         limit:
 *                           type: integer
 *                           example: 10
 *                         total:
 *                           type: integer
 *                           example: 45
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "550e8400-e29b-41d4-a716-446655440000"
 *                           platform:
 *                             type: string
 *                             format: uuid
 *                             example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                           company:
 *                             type: string
 *                             format: uuid
 *                             nullable: true
 *                             example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                           name:
 *                             type: string
 *                             example: "John Doe"
 *                           email:
 *                             type: string
 *                             format: email
 *                             example: "john.doe@example.com"
 *                           role:
 *                             type: string
 *                             enum: [ADMIN, LOGISTICS, CLIENT]
 *                             example: "CLIENT"
 *                           permissions:
 *                             type: array
 *                             items:
 *                               type: string
 *                             example: ["orders.create", "orders.view"]
 *                           permission_template:
 *                             type: string
 *                             nullable: true
 *                             example: "CLIENT_USER"
 *                           isActive:
 *                             type: boolean
 *                             example: true
 *                           lastLoginAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                             example: "2025-12-18T10:30:00.000Z"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-12-19T02:30:00.000Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-12-19T02:30:00.000Z"
 *       400:
 *         description: Bad request - Invalid query parameters
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
 *                       example: "Invalid query parameter"
 *       401:
 *         description: Unauthorized - Authentication required
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
 *                       example: "You are not authorized"
 *       403:
 *         description: Forbidden - ADMIN role required
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
 *                       example: "You are not authorized"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *     security:
 *       - BearerAuth: []
 */

