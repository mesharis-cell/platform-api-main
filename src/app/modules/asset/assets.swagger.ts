/**
 * @swagger
 * /api/operations/v1/asset:
 *   post:
 *     tags:
 *       - Asset Management
 *     summary: Create a new asset
 *     description: Creates a new asset for inventory management. Only ADMIN users can create assets. The platform ID is automatically extracted from the X-Platform header. Assets must belong to a valid company, warehouse, and zone. QR codes must be unique across the platform.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - company_id
 *               - warehouse_id
 *               - zone_id
 *               - name
 *               - category
 *               - tracking_method
 *               - qr_code
 *               - weight_per_unit
 *               - volume_per_unit
 *             properties:
 *               company_id:
 *                 type: string
 *                 format: uuid
 *                 description: Company ID that owns this asset
 *                 example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *               warehouse_id:
 *                 type: string
 *                 format: uuid
 *                 description: Warehouse where asset is stored
 *                 example: "w1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *               zone_id:
 *                 type: string
 *                 format: uuid
 *                 description: Zone within warehouse where asset is located
 *                 example: "z1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *               brand_id:
 *                 type: string
 *                 format: uuid
 *                 description: Brand ID (optional)
 *                 example: "b1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *                 description: Asset name
 *                 example: "Conference Table - Oak Finish"
 *               description:
 *                 type: string
 *                 description: Asset description (optional)
 *                 example: "Large conference table suitable for 12 people"
 *               category:
 *                 type: string
 *                 enum: [FURNITURE, GLASSWARE, INSTALLATION, DECOR, OTHER]
 *                 description: Asset category
 *                 example: "FURNITURE"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: Array of image URLs
 *                 example: ["https://cdn.example.com/assets/table1.jpg"]
 *               tracking_method:
 *                 type: string
 *                 enum: [INDIVIDUAL, BATCH]
 *                 description: How this asset is tracked
 *                 example: "INDIVIDUAL"
 *               total_quantity:
 *                 type: integer
 *                 minimum: 1
 *                 default: 1
 *                 description: Total quantity of this asset
 *                 example: 5
 *               available_quantity:
 *                 type: integer
 *                 minimum: 0
 *                 default: 1
 *                 description: Available quantity (must be <= total_quantity)
 *                 example: 3
 *               qr_code:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Unique QR code identifier
 *                 example: "ASSET-CONF-TABLE-001"
 *               packaging:
 *                 type: string
 *                 maxLength: 100
 *                 description: Packaging information (optional)
 *                 example: "Wrapped in protective blankets"
 *               weight_per_unit:
 *                 type: number
 *                 minimum: 0
 *                 description: Weight per unit in kilograms
 *                 example: 85.5
 *               dimensions:
 *                 type: object
 *                 properties:
 *                   length:
 *                     type: number
 *                     description: Length in centimeters
 *                     example: 300
 *                   width:
 *                     type: number
 *                     description: Width in centimeters
 *                     example: 120
 *                   height:
 *                     type: number
 *                     description: Height in centimeters
 *                     example: 75
 *               volume_per_unit:
 *                 type: number
 *                 minimum: 0
 *                 description: Volume per unit in cubic meters
 *                 example: 2.7
 *               condition:
 *                 type: string
 *                 enum: [GREEN, ORANGE, RED]
 *                 default: GREEN
 *                 description: Asset condition (GREEN=Good, ORANGE=Fair, RED=Needs Repair)
 *                 example: "GREEN"
 *               condition_notes:
 *                 type: string
 *                 description: Notes about asset condition (optional)
 *                 example: "Excellent condition, recently refurbished"
 *               refurb_days_estimate:
 *                 type: integer
 *                 minimum: 0
 *                 description: Estimated days until available if in RED condition (optional)
 *                 example: 7
 *               handling_tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Special handling instructions
 *                 example: ["FRAGILE", "HEAVY"]
 *               status:
 *                 type: string
 *                 enum: [AVAILABLE, BOOKED, OUT, MAINTENANCE]
 *                 default: AVAILABLE
 *                 description: Current asset status
 *                 example: "AVAILABLE"
 *     responses:
 *       201:
 *         description: Asset created successfully
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
 *                   example: "Asset created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Asset'
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
 *                   example: "Available quantity cannot exceed total quantity"
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
 *                   example: "Only platform administrators can create assets"
 *       404:
 *         description: Not Found - Company, warehouse, zone, or brand not found
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
 *                   example: "Warehouse not found"
 *       409:
 *         description: Conflict - QR code already exists
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
 *                   example: "Asset with QR code \"ASSET-CONF-TABLE-001\" already exists"
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
 *       - Asset Management
 *     summary: Get all assets
 *     description: Retrieves a paginated list of assets with filtering and sorting capabilities. CLIENT users can only see assets from their own company. ADMIN and LOGISTICS users can see all assets for the platform.
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
 *         description: Search assets by name (case-insensitive partial match)
 *         required: false
 *         schema:
 *           type: string
 *       - name: company_id
 *         in: query
 *         description: Filter by company ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: warehouse_id
 *         in: query
 *         description: Filter by warehouse ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: zone_id
 *         in: query
 *         description: Filter by zone ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: brand_id
 *         in: query
 *         description: Filter by brand ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: category
 *         in: query
 *         description: Filter by category
 *         required: false
 *         schema:
 *           type: string
 *           enum: [FURNITURE, GLASSWARE, INSTALLATION, DECOR, OTHER]
 *       - name: tracking_method
 *         in: query
 *         description: Filter by tracking method
 *         required: false
 *         schema:
 *           type: string
 *           enum: [INDIVIDUAL, BATCH]
 *       - name: condition
 *         in: query
 *         description: Filter by condition
 *         required: false
 *         schema:
 *           type: string
 *           enum: [GREEN, ORANGE, RED]
 *       - name: status
 *         in: query
 *         description: Filter by status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [AVAILABLE, BOOKED, OUT, MAINTENANCE]
 *       - name: include_inactive
 *         in: query
 *         description: Include deleted assets (default shows only active assets)
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
 *           enum: [name, category, condition, status, created_at, updated_at]
 *       - name: sort_order
 *         in: query
 *         description: Sort order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Assets retrieved successfully
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
 *                   example: "Assets fetched successfully"
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
 *                       example: 50
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/AssetWithRelations'
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
 * /api/operations/v1/asset/{id}:
 *   get:
 *     tags:
 *       - Asset Management
 *     summary: Get a single asset by ID
 *     description: Retrieves detailed information about a specific asset including related company, warehouse, zone, and brand information. CLIENT users can only view assets from their own company.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Asset unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Asset retrieved successfully
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
 *                   example: "Asset fetched successfully"
 *                 data:
 *                   $ref: '#/components/schemas/AssetWithRelations'
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
 *         description: Not Found - Asset not found or user doesn't have access
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
 *                   example: "Asset not found"
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
 *       - Asset Management
 *     summary: Update an asset
 *     description: Updates an existing asset's information. Only ADMIN users can update assets. All fields are optional - only provided fields will be updated. QR code cannot be updated after creation.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Asset unique identifier (UUID)
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
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *                 example: "Updated Conference Table Name"
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: "Updated description"
 *               category:
 *                 type: string
 *                 enum: [FURNITURE, GLASSWARE, INSTALLATION, DECOR, OTHER]
 *                 example: "FURNITURE"
 *               condition:
 *                 type: string
 *                 enum: [GREEN, ORANGE, RED]
 *                 example: "ORANGE"
 *               condition_notes:
 *                 type: string
 *                 nullable: true
 *                 example: "Minor scratches on surface"
 *               status:
 *                 type: string
 *                 enum: [AVAILABLE, BOOKED, OUT, MAINTENANCE]
 *                 example: "MAINTENANCE"
 *               total_quantity:
 *                 type: integer
 *                 minimum: 1
 *                 example: 5
 *               available_quantity:
 *                 type: integer
 *                 minimum: 0
 *                 example: 3
 *     responses:
 *       200:
 *         description: Asset updated successfully
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
 *                   example: "Asset updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Asset'
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
 *                   example: "Available quantity cannot exceed total quantity"
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
 *                   example: "Only platform administrators can update assets"
 *       404:
 *         description: Not Found - Asset not found
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
 *                   example: "Asset not found"
 *       409:
 *         description: Conflict - QR code already exists
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
 *                   example: "Asset with QR code \"ASSET-001\" already exists"
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
 *       - Asset Management
 *     summary: Delete an asset
 *     description: Soft deletes an asset by setting the deleted_at timestamp. Only ADMIN users can delete assets. Cannot delete if the asset is referenced by existing orders.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Asset unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Asset deleted successfully
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
 *                   example: "Asset deleted successfully"
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
 *                   example: "Only platform administrators can delete assets"
 *       404:
 *         description: Not Found - Asset not found
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
 *                   example: "Asset not found"
 *       409:
 *         description: Conflict - Asset is referenced by orders
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
 *                   example: "Cannot delete asset because it is referenced by existing orders. You can deactivate it by setting status to MAINTENANCE instead."
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
 *     Asset:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Asset unique identifier
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *         platform_id:
 *           type: string
 *           format: uuid
 *           description: Platform ID
 *           example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *         company_id:
 *           type: string
 *           format: uuid
 *           description: Company ID
 *           example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *         warehouse_id:
 *           type: string
 *           format: uuid
 *           description: Warehouse ID
 *           example: "w1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *         zone_id:
 *           type: string
 *           format: uuid
 *           description: Zone ID
 *           example: "z1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *         brand_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: Brand ID (optional)
 *           example: "b1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *         name:
 *           type: string
 *           description: Asset name
 *           example: "Conference Table - Oak Finish"
 *         description:
 *           type: string
 *           nullable: true
 *           description: Asset description
 *           example: "Large conference table suitable for 12 people"
 *         category:
 *           type: string
 *           enum: [FURNITURE, GLASSWARE, INSTALLATION, DECOR, OTHER]
 *           description: Asset category
 *           example: "FURNITURE"
 *         images:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of image URLs
 *           example: ["https://cdn.example.com/assets/table1.jpg"]
 *         tracking_method:
 *           type: string
 *           enum: [INDIVIDUAL, BATCH]
 *           description: Tracking method
 *           example: "INDIVIDUAL"
 *         total_quantity:
 *           type: integer
 *           description: Total quantity
 *           example: 5
 *         available_quantity:
 *           type: integer
 *           description: Available quantity
 *           example: 3
 *         qr_code:
 *           type: string
 *           description: Unique QR code
 *           example: "ASSET-CONF-TABLE-001"
 *         packaging:
 *           type: string
 *           nullable: true
 *           description: Packaging information
 *           example: "Wrapped in protective blankets"
 *         weight_per_unit:
 *           type: string
 *           description: Weight per unit in kg (stored as decimal string)
 *           example: "85.50"
 *         dimensions:
 *           type: object
 *           description: Dimensions in cm
 *           properties:
 *             length:
 *               type: number
 *               example: 300
 *             width:
 *               type: number
 *               example: 120
 *             height:
 *               type: number
 *               example: 75
 *         volume_per_unit:
 *           type: string
 *           description: Volume per unit in m³ (stored as decimal string)
 *           example: "2.700"
 *         condition:
 *           type: string
 *           enum: [GREEN, ORANGE, RED]
 *           description: Asset condition
 *           example: "GREEN"
 *         condition_notes:
 *           type: string
 *           nullable: true
 *           description: Condition notes
 *           example: "Excellent condition"
 *         refurb_days_estimate:
 *           type: integer
 *           nullable: true
 *           description: Estimated refurbishment days
 *           example: 7
 *         condition_history:
 *           type: array
 *           description: Condition history
 *           example: []
 *         handling_tags:
 *           type: array
 *           items:
 *             type: string
 *           description: Handling tags
 *           example: ["FRAGILE", "HEAVY"]
 *         status:
 *           type: string
 *           enum: [AVAILABLE, BOOKED, OUT, MAINTENANCE]
 *           description: Asset status
 *           example: "AVAILABLE"
 *         last_scanned_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Last scan timestamp
 *           example: "2025-12-24T10:30:00.000Z"
 *         last_scanned_by:
 *           type: string
 *           format: uuid
 *           nullable: true
 *           description: Last scanned by user ID
 *           example: "u1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *           example: "2025-12-24T08:00:00.000Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *           example: "2025-12-24T10:30:00.000Z"
 *         deleted_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *           description: Deletion timestamp
 *           example: null
 *     AssetWithRelations:
 *       allOf:
 *         - $ref: '#/components/schemas/Asset'
 *         - type: object
 *           properties:
 *             company:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *                 name:
 *                   type: string
 *                   example: "Diageo Events"
 *                 domain:
 *                   type: string
 *                   example: "diageo"
 *             warehouse:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "w1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                 name:
 *                   type: string
 *                   example: "Dubai Main Warehouse"
 *                 city:
 *                   type: string
 *                   example: "Dubai"
 *                 country:
 *                   type: string
 *                   example: "United Arab Emirates"
 *             zone:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "z1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                 name:
 *                   type: string
 *                   example: "Zone A"
 *             brand:
 *               type: object
 *               nullable: true
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                   example: "b1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                 name:
 *                   type: string
 *                   example: "Johnnie Walker"
 */
