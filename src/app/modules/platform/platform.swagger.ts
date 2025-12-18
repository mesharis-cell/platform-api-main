/**
 * @swagger
 * /api/operations/v1/platform:
 *   post:
 *     tags:
 *       - Platform Management
 *     summary: Create a new platform
 *     description: Creates a new platform instance with configuration and feature flags. This endpoint is restricted to super administrators only.
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
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Platform name
 *                 example: "Diageo Events Platform"
 *               domain:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Platform domain identifier (subdomain)
 *                 example: "https://diageo.com"
 *               config:
 *                 type: object
 *                 description: Platform configuration settings
 *                 properties:
 *                   logo_url:
 *                     type: string
 *                     format: uri
 *                     description: URL to the platform logo
 *                     example: "https://cdn.example.com/logos/diageo.png"
 *                   primary_color:
 *                     type: string
 *                     pattern: "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
 *                     description: Primary brand color (hex code)
 *                     example: "#1E3A8A"
 *                   secondary_color:
 *                     type: string
 *                     pattern: "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
 *                     description: Secondary brand color (hex code)
 *                     example: "#F59E0B"
 *                   logistics_partner_name:
 *                     type: string
 *                     maxLength: 100
 *                     description: Name of the logistics partner
 *                     example: "Global Logistics Inc."
 *                   support_email:
 *                     type: string
 *                     format: email
 *                     description: Platform support email address
 *                     example: "support@diageo-events.com"
 *                   currency:
 *                     type: string
 *                     minLength: 3
 *                     maxLength: 3
 *                     description: Default currency (ISO 4217 code)
 *                     example: "USD"
 *               features:
 *                 type: object
 *                 description: Platform feature flags
 *                 properties:
 *                   collections:
 *                     type: boolean
 *                     default: true
 *                     description: Enable asset collections feature
 *                     example: true
 *                   bulk_import:
 *                     type: boolean
 *                     default: true
 *                     description: Enable bulk import functionality
 *                     example: true
 *                   advanced_reporting:
 *                     type: boolean
 *                     default: false
 *                     description: Enable advanced reporting features
 *                     example: false
 *                   api_access:
 *                     type: boolean
 *                     default: false
 *                     description: Enable API access for integrations
 *                     example: false
 *               isActive:
 *                 type: boolean
 *                 default: true
 *                 description: Platform active status
 *                 example: true
 *     responses:
 *       201:
 *         description: Platform created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Platform unique identifier
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     name:
 *                       type: string
 *                       example: "Diageo Events Platform"
 *                     domain:
 *                       type: string
 *                       example: "https://diageo.com"
 *                     config:
 *                       type: object
 *                       properties:
 *                         logo_url:
 *                           type: string
 *                           example: "https://cdn.example.com/logos/diageo.png"
 *                         primary_color:
 *                           type: string
 *                           example: "#1E3A8A"
 *                         secondary_color:
 *                           type: string
 *                           example: "#F59E0B"
 *                         logistics_partner_name:
 *                           type: string
 *                           example: "Global Logistics Inc."
 *                         support_email:
 *                           type: string
 *                           example: "support@diageo-events.com"
 *                         currency:
 *                           type: string
 *                           example: "USD"
 *                     features:
 *                       type: object
 *                       properties:
 *                         collections:
 *                           type: boolean
 *                           example: true
 *                         bulk_import:
 *                           type: boolean
 *                           example: true
 *                         advanced_reporting:
 *                           type: boolean
 *                           example: false
 *                         api_access:
 *                           type: boolean
 *                           example: false
 *                     isActive:
 *                       type: boolean
 *                       example: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       description: Platform creation timestamp
 *                       example: "2025-12-19T01:30:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       description: Platform last update timestamp
 *                       example: "2025-12-19T01:30:00.000Z"
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
 *                             example: "name"
 *                           message:
 *                             type: string
 *                             example: "Name is required"
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
 *                       example: "Only super administrators can create platforms"
 *       409:
 *         description: Conflict - Platform domain already exists
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
 *                       example: "Platform domain already exists"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *     security:
 *       - BearerAuth: []
 */
