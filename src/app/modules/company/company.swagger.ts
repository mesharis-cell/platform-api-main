/**
 * @swagger
 * /api/operations/v1/company:
 *   post:
 *     tags:
 *       - Company Management
 *     summary: Create a new company
 *     description: Creates a new company with a vanity subdomain. The platform ID is automatically extracted from the X-Platform header. Company domain must be unique within the platform.
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
 *               - domain
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: Company name
 *                 example: "Diageo Events"
 *               domain:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 pattern: "^[a-z0-9-]+$"
 *                 description: Company subdomain (lowercase, alphanumeric and hyphens only)
 *                 example: "diageo"
 *               settings:
 *                 type: object
 *                 description: Company branding and configuration settings
 *                 properties:
 *                   branding:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                         description: Company display title
 *                         example: "Diageo"
 *                       logo_url:
 *                         type: string
 *                         format: uri
 *                         description: URL to company logo
 *                         example: "https://cdn.example.com/logos/diageo.png"
 *                       primary_color:
 *                         type: string
 *                         description: Primary brand color (hex code)
 *                         example: "#000000"
 *                       secondary_color:
 *                         type: string
 *                         description: Secondary brand color (hex code)
 *                         example: "#ffffff"
 *               platform_margin_percent:
 *                 type: number
 *                 format: decimal
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Platform margin percentage (defaults to 25.00 if not provided)
 *                 example: 25.00
 *               contact_email:
 *                 type: string
 *                 format: email
 *                 maxLength: 255
 *                 description: Company contact email address
 *                 example: "contact@diageo.com"
 *               contact_phone:
 *                 type: string
 *                 maxLength: 50
 *                 description: Company contact phone number
 *                 example: "+971-4-1234567"
 *               is_active:
 *                 type: boolean
 *                 default: true
 *                 description: Company active status
 *                 example: true
 *     responses:
 *       201:
 *         description: Company created successfully
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
 *                   example: "Company created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Company unique identifier
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       description: Platform ID (from X-Platform header)
 *                       example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                     name:
 *                       type: string
 *                       example: "Diageo Events"
 *                     domain:
 *                       type: string
 *                       description: Company subdomain
 *                       example: "diageo"
 *                     settings:
 *                       type: object
 *                       properties:
 *                         branding:
 *                           type: object
 *                           properties:
 *                             title:
 *                               type: string
 *                               example: "Diageo"
 *                             logo_url:
 *                               type: string
 *                               example: "https://cdn.example.com/logos/diageo.png"
 *                             primary_color:
 *                               type: string
 *                               example: "#000000"
 *                             secondary_color:
 *                               type: string
 *                               example: "#ffffff"
 *                     platform_margin_percent:
 *                       type: string
 *                       description: Platform margin percentage
 *                       example: "25.00"
 *                     contact_email:
 *                       type: string
 *                       nullable: true
 *                       description: Company contact email
 *                       example: "contact@diageo.com"
 *                     contact_phone:
 *                       type: string
 *                       nullable: true
 *                       description: Company contact phone
 *                       example: "+971-4-1234567"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       description: Company creation timestamp
 *                       example: "2025-12-19T03:26:00.000Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       description: Company last update timestamp
 *                       example: "2025-12-19T03:26:00.000Z"
 *                     deleted_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       description: Soft delete timestamp
 *                       example: null
 *                     domains:
 *                       type: array
 *                       description: Company domains (automatically created vanity subdomain)
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "8d7e5679-8536-51ef-a827-557766551111"
 *                           platform_id:
 *                             type: string
 *                             format: uuid
 *                             example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                           company_id:
 *                             type: string
 *                             format: uuid
 *                             example: "550e8400-e29b-41d4-a716-446655440000"
 *                           hostname:
 *                             type: string
 *                             description: Full hostname for the company
 *                             example: "diageo"
 *                           type:
 *                             type: string
 *                             enum: [VANITY, CUSTOM]
 *                             description: Domain type
 *                             example: "VANITY"
 *                           is_verified:
 *                             type: boolean
 *                             example: false
 *                           is_active:
 *                             type: boolean
 *                             example: true
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-12-19T03:26:00.000Z"
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-12-19T03:26:00.000Z"
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
 *                             example: "domain"
 *                           message:
 *                             type: string
 *                             example: "Domain must be lowercase and contain only alphanumeric characters and hyphens"
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
 *                       example: "Only platform administrators can create companies"
 *       409:
 *         description: Conflict - Domain already exists for this platform
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
 *                       example: "DOMAIN_EXISTS"
 *                     message:
 *                       type: string
 *                       example: "Company domain already exists for this platform"
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
 *       - Company Management
 *     summary: Get all companies
 *     description: Retrieves a paginated list of companies for the platform with their associated domains. Supports filtering by search term and sorting. Platform ID is automatically extracted from the X-Platform header.
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
 *         description: Search term to filter companies by name or domain (case-insensitive)
 *         required: false
 *         schema:
 *           type: string
 *       - name: sort_by
 *         in: query
 *         description: Field to sort by
 *         required: false
 *         schema:
 *           type: string
 *           enum: [name, domain, platform_margin_percent, created_at, updated_at]
 *           default: created_at
 *           example: "name"
 *       - name: sort_order
 *         in: query
 *         description: Sort order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *           example: "asc"
 *     responses:
 *       200:
 *         description: Companies retrieved successfully
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
 *                   example: "Companies fetched successfully"
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
 *                           example: 25
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "550e8400-e29b-41d4-a716-446655440000"
 *                           platform_id:
 *                             type: string
 *                             format: uuid
 *                             example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                           name:
 *                             type: string
 *                             example: "Diageo Events"
 *                           domain:
 *                             type: string
 *                             description: Company subdomain
 *                             example: "diageo"
 *                           settings:
 *                             type: object
 *                             properties:
 *                               branding:
 *                                 type: object
 *                                 properties:
 *                                   title:
 *                                     type: string
 *                                     example: "Diageo"
 *                                   logo_url:
 *                                     type: string
 *                                     example: "https://cdn.example.com/logos/diageo.png"
 *                                   primary_color:
 *                                     type: string
 *                                     example: "#000000"
 *                                   secondary_color:
 *                                     type: string
 *                                     example: "#ffffff"
 *                           platform_margin_percent:
 *                             type: string
 *                             description: Platform margin percentage
 *                             example: "25.00"
 *                           contact_email:
 *                             type: string
 *                             nullable: true
 *                             description: Company contact email
 *                             example: "contact@diageo.com"
 *                           contact_phone:
 *                             type: string
 *                             nullable: true
 *                             description: Company contact phone
 *                             example: "+971-4-1234567"
 *                           is_active:
 *                             type: boolean
 *                             example: true
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-12-19T03:26:00.000Z"
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-12-19T03:26:00.000Z"
 *                           deleted_at:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                             example: null
 *                           domains:
 *                             type: array
 *                             description: Associated company domains
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                   format: uuid
 *                                   example: "8d7e5679-8536-51ef-a827-557766551111"
 *                                 platform_id:
 *                                   type: string
 *                                   format: uuid
 *                                   example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                                 company_id:
 *                                   type: string
 *                                   format: uuid
 *                                   example: "550e8400-e29b-41d4-a716-446655440000"
 *                                 hostname:
 *                                   type: string
 *                                   description: Full hostname for the company
 *                                   example: "diageo.pmg-platform.com"
 *                                 type:
 *                                   type: string
 *                                   enum: [VANITY, CUSTOM]
 *                                   example: "VANITY"
 *                                 is_verified:
 *                                   type: boolean
 *                                   example: false
 *                                 is_active:
 *                                   type: boolean
 *                                   example: true
 *                                 created_at:
 *                                   type: string
 *                                   format: date-time
 *                                   example: "2025-12-19T03:26:00.000Z"
 *                                 updated_at:
 *                                   type: string
 *                                   format: date-time
 *                                   example: "2025-12-19T03:26:00.000Z"
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
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/company/{id}:
 *   get:
 *     tags:
 *       - Company Management
 *     summary: Get a single company by ID
 *     description: Retrieves detailed information about a specific company including associated domains. Platform ID is automatically extracted from the X-Platform header.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Company unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Company retrieved successfully
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
 *                   example: "Company fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                     name:
 *                       type: string
 *                       example: "Diageo Events"
 *                     domain:
 *                       type: string
 *                       example: "diageo"
 *                     settings:
 *                       type: object
 *                       properties:
 *                         branding:
 *                           type: object
 *                           properties:
 *                             title:
 *                               type: string
 *                               example: "Diageo"
 *                             logo_url:
 *                               type: string
 *                               example: "https://cdn.example.com/logos/diageo.png"
 *                             primary_color:
 *                               type: string
 *                               example: "#000000"
 *                             secondary_color:
 *                               type: string
 *                               example: "#ffffff"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-19T03:26:00.000Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-19T03:26:00.000Z"
 *                     deleted_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       example: null
 *                     domains:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "8d7e5679-8536-51ef-a827-557766551111"
 *                           hostname:
 *                             type: string
 *                             example: "diageo"
 *                           type:
 *                             type: string
 *                             enum: [VANITY, CUSTOM]
 *                             example: "VANITY"
 *                           is_verified:
 *                             type: boolean
 *                             example: false
 *                           is_active:
 *                             type: boolean
 *                             example: true
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
 *                 message:
 *                   type: string
 *                   example: "You are not authorized"
 *       404:
 *         description: Not Found - Company not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Company not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong!"
 *     security:
 *       - BearerAuth: []
 *   patch:
 *     tags:
 *       - Company Management
 *     summary: Update a company
 *     description: Updates an existing company's information. Only ADMIN users can update companies. All fields are optional - only provided fields will be updated.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Company unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: Company name
 *                 example: "Diageo Events Updated"
 *               domain:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 pattern: "^[a-z0-9-]+$"
 *                 description: Company subdomain (lowercase, alphanumeric and hyphens only)
 *                 example: "diageo-updated"
 *               settings:
 *                 type: object
 *                 description: Company branding and configuration settings
 *                 properties:
 *                   branding:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                         example: "Diageo Updated"
 *                       logo_url:
 *                         type: string
 *                         format: uri
 *                         example: "https://cdn.example.com/logos/diageo-new.png"
 *                       primary_color:
 *                         type: string
 *                         example: "#FF0000"
 *                       secondary_color:
 *                         type: string
 *                         example: "#00FF00"
 *               platform_margin_percent:
 *                 type: number
 *                 format: decimal
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Platform margin percentage
 *                 example: 30.00
 *               contact_email:
 *                 type: string
 *                 format: email
 *                 maxLength: 255
 *                 description: Company contact email address
 *                 example: "updated@diageo.com"
 *               contact_phone:
 *                 type: string
 *                 maxLength: 50
 *                 description: Company contact phone number
 *                 example: "+971-4-7654321"
 *               is_active:
 *                 type: boolean
 *                 description: Company active status
 *                 example: true
 *     responses:
 *       200:
 *         description: Company updated successfully
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
 *                   example: "Company updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "7c9e6679-7425-40de-944b-e07fc1f90ae7"
 *                     name:
 *                       type: string
 *                       example: "Diageo Events Updated"
 *                     domain:
 *                       type: string
 *                       example: "diageo-updated"
 *                     settings:
 *                       type: object
 *                       properties:
 *                         branding:
 *                           type: object
 *                           properties:
 *                             title:
 *                               type: string
 *                               example: "Diageo Updated"
 *                             logo_url:
 *                               type: string
 *                               example: "https://cdn.example.com/logos/diageo-new.png"
 *                             primary_color:
 *                               type: string
 *                               example: "#FF0000"
 *                             secondary_color:
 *                               type: string
 *                               example: "#00FF00"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-19T03:26:00.000Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T15:30:22.156Z"
 *                     deleted_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       example: null
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
 *                 message:
 *                   type: string
 *                   example: "Validation error"
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
 *                 message:
 *                   type: string
 *                   example: "You are not authorized"
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
 *                 message:
 *                   type: string
 *                   example: "Only platform administrators can update companies"
 *       404:
 *         description: Not Found - Company not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Company not found"
 *       409:
 *         description: Conflict - Domain already exists for this platform
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Company with domain \"diageo-updated\" already exists for this platform"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong!"
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     tags:
 *       - Company Management
 *     summary: Delete a company
 *     description: Deletes (soft deletes) a company by setting its deleted_at timestamp. Only ADMIN users can delete companies. This is a soft delete operation.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Company unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Company deleted successfully
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
 *                   example: "Company deleted successfully"
 *                 data:
 *                   type: "null"
 *                   nullable: true
 *                   example: null
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
 *                 message:
 *                   type: string
 *                   example: "You are not authorized"
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
 *                 message:
 *                   type: string
 *                   example: "Only platform administrators can delete companies"
 *       404:
 *         description: Not Found - Company not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Company not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong!"
 *     security:
 *       - BearerAuth: []
 */
