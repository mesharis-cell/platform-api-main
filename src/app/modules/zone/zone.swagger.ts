/**
 * @swagger
 * /api/operations/v1/zone:
 *   post:
 *     tags:
 *       - Zone Management
 *     summary: Create a new zone
 *     description: Creates a new zone within a warehouse for a specific company. The platform ID is automatically extracted from the X-Platform header. Zone name must be unique within the warehouse and company combination.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - warehouse_id
 *               - company_id
 *               - name
 *             properties:
 *               warehouse_id:
 *                 type: string
 *                 format: uuid
 *                 description: Warehouse ID where this zone is located
 *                 example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *               company_id:
 *                 type: string
 *                 format: uuid
 *                 description: Company ID that owns this zone
 *                 example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: Zone name (must be unique within warehouse and company)
 *                 example: "Zone A1"
 *               description:
 *                 type: string
 *                 description: Zone description (optional)
 *                 example: "Premium storage area for fragile items"
 *               capacity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Zone capacity (optional)
 *                 example: 100
 *               is_active:
 *                 type: boolean
 *                 default: true
 *                 description: Zone active status
 *                 example: true
 *     responses:
 *       201:
 *         description: Zone created successfully
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
 *                   example: "Zone created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "f1e2d3c4-b5a6-7890-abcd-ef1234567890"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     warehouse_id:
 *                       type: string
 *                       format: uuid
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                       example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *                     name:
 *                       type: string
 *                       example: "Zone A1"
 *                     description:
 *                       type: string
 *                       nullable: true
 *                       example: "Premium storage area for fragile items"
 *                     capacity:
 *                       type: integer
 *                       nullable: true
 *                       example: 100
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T11:15:41.843Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T11:15:41.843Z"
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
 *                   example: "Only platform administrators and logistics staff can create zones"
 *       404:
 *         description: Not Found - Warehouse or company not found
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
 *                   example: "Warehouse not found or is inactive"
 *       409:
 *         description: Conflict - Zone name already exists for this warehouse and company
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
 *                   example: "Zone with name \"Zone A1\" already exists for this warehouse and company"
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
 *       - Zone Management
 *     summary: Get all zones
 *     description: Retrieves a paginated list of zones with their associated warehouse and company information. Supports filtering by search term, warehouse ID, company ID, and active status. CLIENT role users can only see zones from their own company.
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
 *         description: Search zones by name (case-insensitive partial match)
 *         required: false
 *         schema:
 *           type: string
 *       - name: warehouse_id
 *         in: query
 *         description: Filter zones by warehouse ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: company_id
 *         in: query
 *         description: Filter zones by company ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: include_inactive
 *         in: query
 *         description: Include inactive zones (default shows only active zones)
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
 *           enum: [name, capacity, created_at, updated_at]
 *       - name: sort_order
 *         in: query
 *         description: Sort order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Zones retrieved successfully
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
 *                   example: "Zones fetched successfully"
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
 *                         example: "f1e2d3c4-b5a6-7890-abcd-ef1234567890"
 *                       platform_id:
 *                         type: string
 *                         format: uuid
 *                         example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                       warehouse_id:
 *                         type: string
 *                         format: uuid
 *                         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                       company_id:
 *                         type: string
 *                         format: uuid
 *                         example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *                       name:
 *                         type: string
 *                         example: "Zone A1"
 *                       description:
 *                         type: string
 *                         nullable: true
 *                         example: "Premium storage area for fragile items"
 *                       capacity:
 *                         type: integer
 *                         nullable: true
 *                         example: 100
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-23T11:15:41.843Z"
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-23T11:15:41.843Z"
 *                       warehouse:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                           name:
 *                             type: string
 *                             example: "Dubai Main Warehouse"
 *                           country:
 *                             type: string
 *                             example: "United Arab Emirates"
 *                           city:
 *                             type: string
 *                             example: "Dubai"
 *                       company:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *                           name:
 *                             type: string
 *                             example: "Diageo Events"
 *                           domain:
 *                             type: string
 *                             example: "diageo"
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
 * /api/operations/v1/zone/{id}:
 *   get:
 *     tags:
 *       - Zone Management
 *     summary: Get a single zone by ID
 *     description: Retrieves detailed information about a specific zone including associated warehouse and company information. CLIENT role users can only view zones from their own company.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Zone unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "f1e2d3c4-b5a6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Zone retrieved successfully
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
 *                   example: "Zone fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "f1e2d3c4-b5a6-7890-abcd-ef1234567890"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     warehouse_id:
 *                       type: string
 *                       format: uuid
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                       example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *                     name:
 *                       type: string
 *                       example: "Zone A1"
 *                     description:
 *                       type: string
 *                       nullable: true
 *                       example: "Premium storage area for fragile items"
 *                     capacity:
 *                       type: integer
 *                       nullable: true
 *                       example: 100
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T11:15:41.843Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T11:15:41.843Z"
 *                     warehouse:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                         name:
 *                           type: string
 *                           example: "Dubai Main Warehouse"
 *                         country:
 *                           type: string
 *                           example: "United Arab Emirates"
 *                         city:
 *                           type: string
 *                           example: "Dubai"
 *                         address:
 *                           type: string
 *                           example: "123 Industrial Area, Al Quoz, Dubai"
 *                     company:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *                         name:
 *                           type: string
 *                           example: "Diageo Events"
 *                         domain:
 *                           type: string
 *                           example: "diageo"
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
 *         description: Not Found - Zone not found or user doesn't have access
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
 *                   example: "Zone not found"
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
 *       - Zone Management
 *     summary: Update a zone
 *     description: Updates an existing zone's information. Only ADMIN and LOGISTICS users can update zones. All fields are optional - only provided fields will be updated.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Zone unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "f1e2d3c4-b5a6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               warehouse_id:
 *                 type: string
 *                 format: uuid
 *                 description: Warehouse ID where this zone is located
 *                 example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *               company_id:
 *                 type: string
 *                 format: uuid
 *                 description: Company ID that owns this zone
 *                 example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: Zone name (must be unique within warehouse and company)
 *                 example: "Zone A2"
 *               description:
 *                 type: string
 *                 description: Zone description
 *                 example: "Updated storage area description"
 *               capacity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Zone capacity
 *                 example: 150
 *               is_active:
 *                 type: boolean
 *                 description: Zone active status
 *                 example: true
 *     responses:
 *       200:
 *         description: Zone updated successfully
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
 *                   example: "Zone updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "f1e2d3c4-b5a6-7890-abcd-ef1234567890"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     warehouse_id:
 *                       type: string
 *                       format: uuid
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                       example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *                     name:
 *                       type: string
 *                       example: "Zone A2"
 *                     description:
 *                       type: string
 *                       nullable: true
 *                       example: "Updated storage area description"
 *                     capacity:
 *                       type: integer
 *                       nullable: true
 *                       example: 150
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T11:15:41.843Z"
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
 *                   example: "Only platform administrators and logistics staff can update zones"
 *       404:
 *         description: Not Found - Zone, warehouse, or company not found
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
 *                   example: "Zone not found"
 *       409:
 *         description: Conflict - Zone name already exists for this warehouse and company
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
 *                   example: "Zone with name \"Zone A2\" already exists for this warehouse and company"
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
 *       - Zone Management
 *     summary: Delete a zone
 *     description: Deletes (deactivates) a zone by setting its is_active status to false. Only ADMIN users can delete zones. This is a soft delete operation.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Zone unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "f1e2d3c4-b5a6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Zone deleted successfully
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
 *                   example: "Zone deleted successfully"
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
 *                   example: "Only platform administrators can delete zones"
 *       404:
 *         description: Not Found - Zone not found
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
 *                   example: "Zone not found"
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
