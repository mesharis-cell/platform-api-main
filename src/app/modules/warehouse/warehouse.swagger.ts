/**
 * @swagger
 * /api/operations/v1/warehouse:
 *   post:
 *     tags:
 *       - Warehouse Management
 *     summary: Create a new warehouse
 *     description: Creates a new warehouse for the platform. The platform ID is automatically extracted from the X-Platform header. Warehouse name must be unique within the platform.
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
 *               - country
 *               - city
 *               - address
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Warehouse name (must be unique within the platform)
 *                 example: "Dubai Main Warehouse"
 *               country:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: Country where warehouse is located
 *                 example: "United Arab Emirates"
 *               city:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: City where warehouse is located
 *                 example: "Dubai"
 *               address:
 *                 type: string
 *                 description: Full address of the warehouse
 *                 example: "123 Industrial Area, Al Quoz, Dubai"
 *               coordinates:
 *                 type: object
 *                 description: GPS coordinates of the warehouse (optional)
 *                 properties:
 *                   lat:
 *                     type: number
 *                     description: Latitude
 *                     example: 25.2048
 *                   lng:
 *                     type: number
 *                     description: Longitude
 *                     example: 55.2708
 *               is_active:
 *                 type: boolean
 *                 default: true
 *                 description: Warehouse active status
 *                 example: true
 *     responses:
 *       201:
 *         description: Warehouse created successfully
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
 *                   example: "Warehouse created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Warehouse unique identifier
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       description: Platform ID (from X-Platform header)
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     name:
 *                       type: string
 *                       example: "Dubai Main Warehouse"
 *                     country:
 *                       type: string
 *                       example: "United Arab Emirates"
 *                     city:
 *                       type: string
 *                       example: "Dubai"
 *                     address:
 *                       type: string
 *                       example: "123 Industrial Area, Al Quoz, Dubai"
 *                     coordinates:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         lat:
 *                           type: number
 *                           example: 25.2048
 *                         lng:
 *                           type: number
 *                           example: 55.2708
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       description: Warehouse creation timestamp
 *                       example: "2025-12-23T10:15:41.843Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       description: Warehouse last update timestamp
 *                       example: "2025-12-23T10:15:41.843Z"
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
 *                 errorSources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       path:
 *                         type: string
 *                         example: "body.name"
 *                       message:
 *                         type: string
 *                         example: "Name is required"
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
 *                   example: "Only platform administrators and logistics staff can create warehouses"
 *       409:
 *         description: Conflict - Warehouse name already exists for this platform
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
 *                   example: "Warehouse with name \"Dubai Main Warehouse\" already exists for this platform"
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
 *       - Warehouse Management
 *     summary: Get all warehouses
 *     description: Retrieves a paginated list of warehouses. Supports filtering by search term, country, city, and active status. Supports sorting by multiple fields.
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
 *         description: Search warehouses by name, country, or city (case-insensitive partial match)
 *         required: false
 *         schema:
 *           type: string
 *       - name: country
 *         in: query
 *         description: Filter warehouses by country
 *         required: false
 *         schema:
 *           type: string
 *       - name: city
 *         in: query
 *         description: Filter warehouses by city
 *         required: false
 *         schema:
 *           type: string
 *       - name: include_inactive
 *         in: query
 *         description: Include inactive warehouses (default shows only active warehouses)
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
 *           enum: [name, country, city, created_at, updated_at]
 *       - name: sort_order
 *         in: query
 *         description: Sort order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Warehouses retrieved successfully
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
 *                   example: "Warehouses fetched successfully"
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
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                       platform_id:
 *                         type: string
 *                         format: uuid
 *                         example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                       name:
 *                         type: string
 *                         example: "Dubai Main Warehouse"
 *                       country:
 *                         type: string
 *                         example: "United Arab Emirates"
 *                       city:
 *                         type: string
 *                         example: "Dubai"
 *                       address:
 *                         type: string
 *                         example: "123 Industrial Area, Al Quoz, Dubai"
 *                       coordinates:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           lat:
 *                             type: number
 *                             example: 25.2048
 *                           lng:
 *                             type: number
 *                             example: 55.2708
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-23T10:15:41.843Z"
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-23T10:15:41.843Z"
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
 * /api/operations/v1/warehouse/{id}:
 *   get:
 *     tags:
 *       - Warehouse Management
 *     summary: Get a single warehouse by ID
 *     description: Retrieves detailed information about a specific warehouse.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Warehouse unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Warehouse retrieved successfully
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
 *                   example: "Warehouse fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     name:
 *                       type: string
 *                       example: "Dubai Main Warehouse"
 *                     country:
 *                       type: string
 *                       example: "United Arab Emirates"
 *                     city:
 *                       type: string
 *                       example: "Dubai"
 *                     address:
 *                       type: string
 *                       example: "123 Industrial Area, Al Quoz, Dubai"
 *                     coordinates:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         lat:
 *                           type: number
 *                           example: 25.2048
 *                         lng:
 *                           type: number
 *                           example: 55.2708
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T10:15:41.843Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T10:15:41.843Z"
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
 *         description: Not Found - Warehouse not found
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
 *       - Warehouse Management
 *     summary: Update a warehouse
 *     description: Updates an existing warehouse's information. Only ADMIN and LOGISTICS users can update warehouses. All fields are optional - only provided fields will be updated.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Warehouse unique identifier (UUID)
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
 *                 maxLength: 100
 *                 description: Warehouse name (must be unique within the platform)
 *                 example: "Dubai Central Warehouse"
 *               country:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: Country where warehouse is located
 *                 example: "United Arab Emirates"
 *               city:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: City where warehouse is located
 *                 example: "Dubai"
 *               address:
 *                 type: string
 *                 description: Full address of the warehouse
 *                 example: "456 New Industrial Area, Al Quoz, Dubai"
 *               coordinates:
 *                 type: object
 *                 description: GPS coordinates of the warehouse
 *                 properties:
 *                   lat:
 *                     type: number
 *                     description: Latitude
 *                     example: 25.2048
 *                   lng:
 *                     type: number
 *                     description: Longitude
 *                     example: 55.2708
 *               is_active:
 *                 type: boolean
 *                 description: Warehouse active status
 *                 example: true
 *     responses:
 *       200:
 *         description: Warehouse updated successfully
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
 *                   example: "Warehouse updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     name:
 *                       type: string
 *                       example: "Dubai Central Warehouse"
 *                     country:
 *                       type: string
 *                       example: "United Arab Emirates"
 *                     city:
 *                       type: string
 *                       example: "Dubai"
 *                     address:
 *                       type: string
 *                       example: "456 New Industrial Area, Al Quoz, Dubai"
 *                     coordinates:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         lat:
 *                           type: number
 *                           example: 25.2048
 *                         lng:
 *                           type: number
 *                           example: 55.2708
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T10:15:41.843Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T14:30:22.156Z"
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
 *                   example: "Only platform administrators and logistics staff can update warehouses"
 *       404:
 *         description: Not Found - Warehouse not found
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
 *         description: Conflict - Warehouse name already exists for this platform
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
 *                   example: "Warehouse with name \"Dubai Central Warehouse\" already exists for this platform"
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
 *       - Warehouse Management
 *     summary: Delete a warehouse
 *     description: Deletes (deactivates) a warehouse by setting its is_active status to false. Only ADMIN users can delete warehouses. This is a soft delete operation.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Warehouse unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Warehouse deleted successfully
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
 *                   example: "Warehouse deleted successfully"
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
 *                   example: "Only platform administrators can delete warehouses"
 *       404:
 *         description: Not Found - Warehouse not found
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
