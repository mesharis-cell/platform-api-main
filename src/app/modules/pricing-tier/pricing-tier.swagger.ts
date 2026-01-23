/**
 * @swagger
 * /api/operations/v1/pricing-tier:
 *   post:
 *     tags:
 *       - Pricing Tier Management
 *     summary: Create a new pricing tier
 *     description: Creates a new pricing tier for location-based and volume-based pricing. Only ADMIN users can create pricing tiers. The platform ID is automatically extracted from the X-Platform header. Volume ranges must not overlap with existing active tiers for the same location.
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
 *                 description: Base price for this tier (A2 flat rate)
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
 *                   example: "Maximum volume must be greater than or equal to minimum volume"
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
 *                   example: "Only platform administrators can create pricing tiers"
 *       409:
 *         description: Conflict - Volume range overlaps with existing tier
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
 *                   example: "Volume range 0-10 m³ overlaps with existing tier (0-20 m³) for Dubai, United Arab Emirates"
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
 *   get:
 *     tags:
 *       - Pricing Tier Management
 *     summary: Get all pricing tiers
 *     description: Retrieves a paginated list of pricing tiers. Supports filtering by search term, country, city, and active status. Supports sorting by multiple fields. Only ADMIN and LOGISTICS users can access this endpoint.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: page
 *         in: query
 *         description: Page number for pagination
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - name: limit
 *         in: query
 *         description: Number of items per page (max 100)
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *       - name: search_term
 *         in: query
 *         description: Search by country or city (case-insensitive partial match)
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
 *         description: Include inactive pricing tiers (default shows only active tiers)
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
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     total:
 *                       type: integer
 *                       example: 25
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PricingTier'
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
 *                 message:
 *                   type: string
 *                   example: "Invalid query parameter"
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
 *                   example: "Insufficient permissions"
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

/**
 * @swagger
 * /api/operations/v1/pricing-tier/calculate:
 *   get:
 *     tags:
 *       - Pricing Tier Management
 *     summary: Calculate pricing for given volume and location
 *     description: |
 *       Calculates the A2 base price and estimated total (including platform margin) for a given volume and location.
 *       This is a utility endpoint for order creation. The endpoint finds the matching pricing tier based on country, city, and volume,
 *       then applies the company's platform margin to calculate the estimated total.
 *
 *       **Access:** Any authenticated user (ADMIN, LOGISTICS, CLIENT) can use this endpoint.
 *
 *       **Note:** This returns a flat rate for the volume range, not a per-m³ rate.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: country
 *         in: query
 *         required: true
 *         description: Country for pricing calculation
 *         schema:
 *           type: string
 *         example: "United Arab Emirates"
 *       - name: city
 *         in: query
 *         required: true
 *         description: City for pricing calculation
 *         schema:
 *           type: string
 *         example: "Dubai"
 *       - name: volume
 *         in: query
 *         required: true
 *         description: Volume in cubic meters (m³)
 *         schema:
 *           type: number
 *           minimum: 0
 *         example: 5.5
 *     responses:
 *       200:
 *         description: Pricing calculated successfully
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
 *                   example: "Pricing calculated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     pricing_tier_id:
 *                       type: string
 *                       format: uuid
 *                       description: ID of the matched pricing tier
 *                       example: "tier-uuid-1"
 *                     country:
 *                       type: string
 *                       description: Country from the matched tier
 *                       example: "United Arab Emirates"
 *                     city:
 *                       type: string
 *                       description: City from the matched tier
 *                       example: "Dubai"
 *                     volume_min:
 *                       type: number
 *                       description: Minimum volume of the matched tier (m³)
 *                       example: 0
 *                     volume_max:
 *                       type: number
 *                       nullable: true
 *                       description: Maximum volume of the matched tier (m³), null for unlimited
 *                       example: 10
 *                     base_price:
 *                       type: number
 *                       description: A2 base/flat rate for this tier
 *                       example: 100.50
 *                     platform_margin_percent:
 *                       type: number
 *                       description: Platform margin percentage (from company settings or default 25%)
 *                       example: 25.00
 *                     platform_margin_amount:
 *                       type: number
 *                       description: Platform margin amount in currency
 *                       example: 25.13
 *                     estimated_total:
 *                       type: number
 *                       description: Final estimated total (base_price + platform_margin_amount)
 *                       example: 125.63
 *                     matched_volume:
 *                       type: number
 *                       description: The volume that was used for matching
 *                       example: 5.5
 *                     note:
 *                       type: string
 *                       description: Important note about pricing calculation
 *                       example: "This is a flat rate for the volume range, not a per-m³ rate"
 *       400:
 *         description: Validation error - Missing or invalid parameters
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
 *                   example: "volume must be a positive number"
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
 *         description: No matching pricing tier found
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
 *                   example: "No active pricing tier found for Dubai, United Arab Emirates with volume 5.5m³"
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

/**
 * @swagger
 * /api/operations/v1/pricing-tier/{id}:
 *   get:
 *     tags:
 *       - Pricing Tier Management
 *     summary: Get a single pricing tier by ID
 *     description: Retrieves detailed information about a specific pricing tier. Only ADMIN and LOGISTICS users can access this endpoint.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Pricing tier unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
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
 *         description: Not Found - Pricing tier not found
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
 *                   example: "Pricing tier not found"
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
 *       - Pricing Tier Management
 *     summary: Update a pricing tier
 *     description: Updates an existing pricing tier. Only ADMIN users can update pricing tiers. All fields are optional - only provided fields will be updated. Country and city cannot be updated. Volume ranges must not overlap with existing active tiers.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Pricing tier unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               volume_min:
 *                 type: number
 *                 minimum: 0
 *                 description: Minimum volume in cubic meters
 *                 example: 5
 *               volume_max:
 *                 type: number
 *                 minimum: 0
 *                 nullable: true
 *                 description: Maximum volume in cubic meters (null for unlimited)
 *                 example: 20
 *               base_price:
 *                 type: number
 *                 minimum: 0
 *                 description: Base price for this tier
 *                 example: 150.75
 *               is_active:
 *                 type: boolean
 *                 description: Pricing tier active status
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
 *         description: Bad request - Validation error or country/city update attempt
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
 *                   example: "Country and city cannot be updated. Please create a new pricing tier instead."
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
 *                   example: "Only platform administrators can update pricing tiers"
 *       404:
 *         description: Not Found - Pricing tier not found
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
 *                   example: "Pricing tier not found"
 *       409:
 *         description: Conflict - Volume range overlaps with existing tier
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
 *                   example: "Volume range 5-20 m³ overlaps with existing tier (0-25 m³) for Dubai, United Arab Emirates"
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
 *       - Pricing Tier Management
 *     summary: Delete a pricing tier
 *     description: Permanently deletes a pricing tier. Only ADMIN users can delete pricing tiers. Cannot delete if the tier is referenced by any orders.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Pricing tier unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
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
 *                   example: "Only platform administrators can delete pricing tiers"
 *       404:
 *         description: Not Found - Pricing tier not found
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
 *                   example: "Pricing tier not found"
 *       409:
 *         description: Conflict - Pricing tier is referenced by orders
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
 *                   example: "Cannot delete pricing tier because it is referenced by existing orders. You can deactivate it instead."
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
 *           description: Pricing tier unique identifier
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *         platform_id:
 *           type: string
 *           format: uuid
 *           description: Platform ID
 *           example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *         country:
 *           type: string
 *           description: Country for this pricing tier
 *           example: "United Arab Emirates"
 *         city:
 *           type: string
 *           description: City for this pricing tier
 *           example: "Dubai"
 *         volume_min:
 *           type: number
 *           description: Minimum volume in cubic meters
 *           example: 0
 *         volume_max:
 *           type: number
 *           nullable: true
 *           description: Maximum volume in cubic meters (null for unlimited)
 *           example: 10
 *         base_price:
 *           type: number
 *           description: Base price for this tier
 *           example: 100.50
 *         is_active:
 *           type: boolean
 *           description: Pricing tier active status
 *           example: true
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Pricing tier creation timestamp
 *           example: "2025-12-23T20:00:00.000Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Pricing tier last update timestamp
 *           example: "2025-12-23T20:00:00.000Z"
 */
