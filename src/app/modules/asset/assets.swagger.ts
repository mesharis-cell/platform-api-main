/**
 * @swagger
 * /api/operations/v1/asset:
 *   post:
 *     tags:
 *       - Asset Management
 *     summary: Create a new asset
 *     description: Creates a new asset for inventory management. ADMIN and LOGISTICS users can create assets. For INDIVIDUAL tracking with quantity > 1, creates N separate assets with unique QR codes. Creates initial condition history if condition is not GREEN or has notes.
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
 *                 example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *               warehouse_id:
 *                 type: string
 *                 format: uuid
 *                 example: "w1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *               zone_id:
 *                 type: string
 *                 format: uuid
 *                 example: "z1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *               brand_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 example: "b1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *                 example: "Conference Table - Oak Finish"
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: "Large conference table suitable for 12 people"
 *               category:
 *                 type: string
 *                 enum: [FURNITURE, GLASSWARE, INSTALLATION, DECOR, OTHER]
 *                 example: "FURNITURE"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 example: ["https://cdn.example.com/assets/table1.jpg"]
 *               tracking_method:
 *                 type: string
 *                 enum: [INDIVIDUAL, BATCH]
 *                 example: "INDIVIDUAL"
 *               total_quantity:
 *                 type: integer
 *                 minimum: 1
 *                 default: 1
 *                 example: 5
 *               available_quantity:
 *                 type: integer
 *                 minimum: 0
 *                 default: 1
 *                 example: 3
 *               qr_code:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: "ASSET-CONF-TABLE-001"
 *               packaging:
 *                 type: string
 *                 maxLength: 100
 *                 nullable: true
 *                 example: "Wrapped in protective blankets"
 *               weight_per_unit:
 *                 type: number
 *                 minimum: 0
 *                 example: 85.5
 *               dimensions:
 *                 type: object
 *                 properties:
 *                   length:
 *                     type: number
 *                     example: 300
 *                   width:
 *                     type: number
 *                     example: 120
 *                   height:
 *                     type: number
 *                     example: 75
 *               volume_per_unit:
 *                 type: number
 *                 minimum: 0
 *                 example: 2.7
 *               condition:
 *                 type: string
 *                 enum: [GREEN, ORANGE, RED]
 *                 default: GREEN
 *                 example: "GREEN"
 *               condition_notes:
 *                 type: string
 *                 nullable: true
 *                 example: "Excellent condition, recently refurbished"
 *               refurb_days_estimate:
 *                 type: integer
 *                 minimum: 0
 *                 nullable: true
 *                 example: 7
 *               handling_tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["FRAGILE", "HEAVY"]
 *               status:
 *                 type: string
 *                 enum: [AVAILABLE, BOOKED, OUT, MAINTENANCE]
 *                 default: AVAILABLE
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
 *                   allOf:
 *                     - $ref: '#/components/schemas/Asset'
 *                     - type: object
 *                       properties:
 *                         meta:
 *                           type: object
 *                           properties:
 *                             assets_created:
 *                               type: integer
 *                               example: 5
 *                             message:
 *                               type: string
 *                               example: "Created 5 individual assets"
 *       400:
 *         description: Bad Request
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
 *         description: Unauthorized
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
 *         description: Forbidden
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
 *                   example: "Access denied"
 *       404:
 *         description: Not Found
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
 *         description: Conflict
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
 *                   example: "Asset with QR code already exists"
 *       500:
 *         description: Internal Server Error
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
 *     description: Retrieves a paginated list of assets with filtering and sorting. CLIENT users see only their company's assets. ADMIN and LOGISTICS see all platform assets.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *       - name: search_term
 *         in: query
 *         description: Search by asset name
 *         schema:
 *           type: string
 *       - name: company_id
 *         in: query
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: warehouse_id
 *         in: query
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: zone_id
 *         in: query
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: brand_id
 *         in: query
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: category
 *         in: query
 *         schema:
 *           type: string
 *           enum: [FURNITURE, GLASSWARE, INSTALLATION, DECOR, OTHER]
 *       - name: tracking_method
 *         in: query
 *         schema:
 *           type: string
 *           enum: [INDIVIDUAL, BATCH]
 *       - name: condition
 *         in: query
 *         schema:
 *           type: string
 *           enum: [GREEN, ORANGE, RED]
 *       - name: status
 *         in: query
 *         schema:
 *           type: string
 *           enum: [AVAILABLE, BOOKED, OUT, MAINTENANCE]
 *       - name: include_inactive
 *         in: query
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - name: sort_by
 *         in: query
 *         schema:
 *           type: string
 *           enum: [name, category, condition, status, created_at, updated_at]
 *       - name: sort_order
 *         in: query
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
 *         description: Bad Request
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
 *         description: Unauthorized
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
 *         description: Internal Server Error
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
 *     summary: Get asset by ID
 *     description: Retrieves detailed information about a specific asset including related entities and latest condition notes. CLIENT users can only view their company's assets.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *                   $ref: '#/components/schemas/AssetWithDetails'
 *       401:
 *         description: Unauthorized
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
 *         description: Not Found
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
 *         description: Internal Server Error
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
 *     summary: Update asset
 *     description: Updates an existing asset. ADMIN and LOGISTICS users can update assets. Tracks condition changes in condition_history. Auto-clears refurb_days_estimate when condition changes to GREEN.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
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
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *               description:
 *                 type: string
 *                 nullable: true
 *               category:
 *                 type: string
 *                 enum: [FURNITURE, GLASSWARE, INSTALLATION, DECOR, OTHER]
 *               condition:
 *                 type: string
 *                 enum: [GREEN, ORANGE, RED]
 *               condition_notes:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [AVAILABLE, BOOKED, OUT, MAINTENANCE]
 *               total_quantity:
 *                 type: integer
 *                 minimum: 1
 *               available_quantity:
 *                 type: integer
 *                 minimum: 0
 *               refurb_days_estimate:
 *                 type: integer
 *                 minimum: 0
 *                 nullable: true
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
 *         description: Bad Request
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
 *         description: Unauthorized
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
 *         description: Forbidden
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
 *                   example: "Access denied"
 *       404:
 *         description: Not Found
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
 *         description: Conflict
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
 *                   example: "Cannot update asset"
 *       500:
 *         description: Internal Server Error
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
 *     summary: Delete asset
 *     description: Soft deletes an asset. ADMIN and LOGISTICS users can delete assets. Cannot delete if asset has active bookings.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
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
 *                   example: null
 *       401:
 *         description: Unauthorized
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
 *         description: Forbidden
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
 *                   example: "Access denied"
 *       404:
 *         description: Not Found
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
 *         description: Conflict - Asset has active bookings
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
 *                   example: "Cannot delete asset that has active bookings"
 *       500:
 *         description: Internal Server Error
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
 *         platform_id:
 *           type: string
 *           format: uuid
 *         company_id:
 *           type: string
 *           format: uuid
 *         warehouse_id:
 *           type: string
 *           format: uuid
 *         zone_id:
 *           type: string
 *           format: uuid
 *         brand_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         name:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         category:
 *           type: string
 *           enum: [FURNITURE, GLASSWARE, INSTALLATION, DECOR, OTHER]
 *         images:
 *           type: array
 *           items:
 *             type: string
 *         tracking_method:
 *           type: string
 *           enum: [INDIVIDUAL, BATCH]
 *         total_quantity:
 *           type: integer
 *         available_quantity:
 *           type: integer
 *         qr_code:
 *           type: string
 *         packaging:
 *           type: string
 *           nullable: true
 *         weight_per_unit:
 *           type: string
 *         dimensions:
 *           type: object
 *         volume_per_unit:
 *           type: string
 *         condition:
 *           type: string
 *           enum: [GREEN, ORANGE, RED]
 *         condition_notes:
 *           type: string
 *           nullable: true
 *         refurb_days_estimate:
 *           type: integer
 *           nullable: true
 *         condition_history:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               condition:
 *                 type: string
 *               notes:
 *                 type: string
 *                 nullable: true
 *               updated_by:
 *                 type: string
 *                 format: uuid
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *         handling_tags:
 *           type: array
 *           items:
 *             type: string
 *         status:
 *           type: string
 *           enum: [AVAILABLE, BOOKED, OUT, MAINTENANCE]
 *         last_scanned_at:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         last_scanned_by:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         deleted_at:
 *           type: string
 *           format: date-time
 *           nullable: true
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
 *                 name:
 *                   type: string
 *                 domain:
 *                   type: string
 *             warehouse:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *                 city:
 *                   type: string
 *                 country:
 *                   type: string
 *             zone:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *             brand:
 *               type: object
 *               nullable: true
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *     AssetWithDetails:
 *       allOf:
 *         - $ref: '#/components/schemas/AssetWithRelations'
 *         - type: object
 *           properties:
 *             latest_condition_notes:
 *               type: string
 *               nullable: true
 *             company_details:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *                 domain:
 *                   type: string
 *             warehouse_details:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *                 city:
 *                   type: string
 *                 country:
 *                   type: string
 *             zone_details:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *             brand_details:
 *               type: object
 *               nullable: true
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *                 logo_url:
 *                   type: string
 *                   nullable: true
 */
