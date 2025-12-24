/**
 * @swagger
 * /api/operations/v1/pricing-tier:
 *   post:
 *     tags:
 *       - Pricing Tier Management
 *     summary: Create a new pricing tier
 *     description: Creates a new pricing tier for location-based and volume-based pricing. Only ADMIN users can create pricing tiers. The platform ID is automatically extracted from the X-Platform header.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - country
 *               - city
 *               - volume_min
 *               - base_price
 *             properties:
 *               country:
 *                 type: string
 *                 maxLength: 50
 *                 description: Country for this pricing tier
 *                 example: "United Arab Emirates"
 *               city:
 *                 type: string
 *                 maxLength: 50
 *                 description: City for this pricing tier
 *                 example: "Dubai"
 *               volume_min:
 *                 type: number
 *                 minimum: 0
 *                 description: Minimum volume in cubic meters
 *                 example: 0
 *               volume_max:
 *                 type: number
 *                 minimum: 0
 *                 nullable: true
 *                 description: Maximum volume in cubic meters (null for unlimited)
 *                 example: 10
 *               base_price:
 *                 type: number
 *                 minimum: 0
 *                 description: Base price for this tier
 *                 example: 100.50
 *               is_active:
 *                 type: boolean
 *                 default: true
 *                 description: Pricing tier active status
 *                 example: true
 *     responses:
 *       201:
 *         description: Pricing tier created successfully
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
 *                   example: "Pricing tier created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/PricingTier'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         description: Conflict - Pricing tier already exists
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
 *                   example: "Pricing tier with this country, city, and volume range already exists"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/pricing-tier/locations:
 *   get:
 *     tags:
 *       - Pricing Tier Management
 *     summary: Get pricing tier locations
 *     description: Retrieves unique countries and cities from active pricing tiers. Returns a list of countries and cities grouped by country. Only ADMIN and LOGISTICS users can access this endpoint.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     responses:
 *       200:
 *         description: Pricing tier locations retrieved successfully
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
 *                   example: "Pricing tier locations fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     countries:
 *                       type: array
 *                       description: Sorted list of unique countries
 *                       items:
 *                         type: string
 *                       example: ["Saudi Arabia", "United Arab Emirates"]
 *                     locations_by_country:
 *                       type: object
 *                       description: Cities grouped by country (sorted)
 *                       additionalProperties:
 *                         type: array
 *                         items:
 *                           type: string
 *                       example:
 *                         "United Arab Emirates": ["Abu Dhabi", "Dubai"]
 *                         "Saudi Arabia": ["Jeddah", "Riyadh"]
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/pricing-tier:
 *   get:
 *     tags:
 *       - Pricing Tier Management
 *     summary: Get all pricing tiers
 *     description: Retrieves a paginated list of pricing tiers. Supports filtering by search term, country, city, and active status.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: search_term
 *         in: query
 *         description: Search by country or city (case-insensitive)
 *         required: false
 *         schema:
 *           type: string
 *       - name: country
 *         in: query
 *         description: Filter by country
 *         required: false
 *         schema:
 *           type: string
 *       - name: city
 *         in: query
 *         description: Filter by city
 *         required: false
 *         schema:
 *           type: string
 *       - name: include_inactive
 *         in: query
 *         description: Include inactive pricing tiers
 *         required: false
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - name: sort_by
 *         in: query
 *         description: Field to sort by
 *         required: false
 *         schema:
 *           type: string
 *           enum: [country, city, volume_min, volume_max, base_price, created_at, updated_at]
 *       - name: sort_order
 *         in: query
 *         description: Sort order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Pricing tiers retrieved successfully
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
 *                   example: "Pricing tiers fetched successfully"
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PricingTier'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/pricing-tier/{id}:
 *   get:
 *     tags:
 *       - Pricing Tier Management
 *     summary: Get a single pricing tier by ID
 *     description: Retrieves detailed information about a specific pricing tier.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Pricing tier unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Pricing tier retrieved successfully
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
 *                   example: "Pricing tier fetched successfully"
 *                 data:
 *                   $ref: '#/components/schemas/PricingTier'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *     security:
 *       - BearerAuth: []
 *   patch:
 *     tags:
 *       - Pricing Tier Management
 *     summary: Update a pricing tier
 *     description: Updates an existing pricing tier. Only ADMIN users can update pricing tiers. All fields are optional.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Pricing tier unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               country:
 *                 type: string
 *                 maxLength: 50
 *                 example: "Saudi Arabia"
 *               city:
 *                 type: string
 *                 maxLength: 50
 *                 example: "Riyadh"
 *               volume_min:
 *                 type: number
 *                 minimum: 0
 *                 example: 5
 *               volume_max:
 *                 type: number
 *                 minimum: 0
 *                 nullable: true
 *                 example: 20
 *               base_price:
 *                 type: number
 *                 minimum: 0
 *                 example: 150.75
 *               is_active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Pricing tier updated successfully
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
 *                   example: "Pricing tier updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/PricingTier'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       409:
 *         description: Conflict - Pricing tier already exists
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
 *                   example: "Pricing tier with this country, city, and volume range already exists"
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     tags:
 *       - Pricing Tier Management
 *     summary: Delete a pricing tier
 *     description: Soft deletes a pricing tier by setting is_active to false. Only ADMIN users can delete pricing tiers.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Pricing tier unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Pricing tier deleted successfully
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
 *                   example: "Pricing tier deleted successfully"
 *                 data:
 *                   type: "null"
 *                   nullable: true
 *                   example: null
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PricingTier:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "tier-uuid-1"
 *         platform_id:
 *           type: string
 *           format: uuid
 *           example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *         country:
 *           type: string
 *           example: "United Arab Emirates"
 *         city:
 *           type: string
 *           example: "Dubai"
 *         volume_min:
 *           type: string
 *           description: Minimum volume in cubic meters (stored as decimal string)
 *           example: "0.000"
 *         volume_max:
 *           type: string
 *           nullable: true
 *           description: Maximum volume in cubic meters (stored as decimal string, null for unlimited)
 *           example: "10.000"
 *         base_price:
 *           type: string
 *           description: Base price (stored as decimal string)
 *           example: "100.50"
 *         is_active:
 *           type: boolean
 *           example: true
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-12-23T20:00:00.000Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           example: "2025-12-23T20:00:00.000Z"
 */
