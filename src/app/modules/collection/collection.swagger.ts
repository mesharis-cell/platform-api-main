/**
 * @swagger
 * /api/operations/v1/collection:
 *   post:
 *     tags:
 *       - Collection Management
 *     summary: Create a new collection
 *     description: Creates a new collection for organizing assets. The platform ID is automatically extracted from the X-Platform header. Collection must belong to a company and optionally to a brand.
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
 *               - name
 *             properties:
 *               company_id:
 *                 type: string
 *                 format: uuid
 *                 description: Company ID that owns this collection
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *               brand_id:
 *                 type: string
 *                 format: uuid
 *                 description: Brand ID (optional)
 *                 example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *                 description: Collection name
 *                 example: "Event Package - Corporate"
 *               description:
 *                 type: string
 *                 description: Collection description
 *                 example: "Standard corporate event package with tables, chairs, and decorations"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of image URLs
 *                 example: ["https://example.com/image1.jpg", "https://example.com/image2.jpg"]
 *               category:
 *                 type: string
 *                 maxLength: 50
 *                 description: Collection category
 *                 example: "Corporate Events"
 *               is_active:
 *                 type: boolean
 *                 default: true
 *                 description: Collection active status
 *                 example: true
 *     responses:
 *       201:
 *         description: Collection created successfully
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
 *                   example: "Collection created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     brand_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     name:
 *                       type: string
 *                       example: "Event Package - Corporate"
 *                     description:
 *                       type: string
 *                       nullable: true
 *                       example: "Standard corporate event package"
 *                     images:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: []
 *                     category:
 *                       type: string
 *                       nullable: true
 *                       example: "Corporate Events"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T16:20:00.000Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T16:20:00.000Z"
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
 *                   example: "Only administrators and logistics staff can create collections"
 *       404:
 *         description: Not Found - Company or brand not found
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
 *                   example: "Company not found or is archived"
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
 *       - Collection Management
 *     summary: Get all collections
 *     description: Retrieves a paginated list of collections. Supports filtering by search term, company, brand, category, and active/deleted status. CLIENT role users can only see collections from their own company.
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
 *         description: Search collections by name (case-insensitive partial match)
 *         required: false
 *         schema:
 *           type: string
 *       - name: company_id
 *         in: query
 *         description: Filter collections by company ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: brand_id
 *         in: query
 *         description: Filter collections by brand ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: category
 *         in: query
 *         description: Filter collections by category
 *         required: false
 *         schema:
 *           type: string
 *       - name: include_inactive
 *         in: query
 *         description: Include inactive collections (default shows only active collections)
 *         required: false
 *         schema:
 *           type: string
 *           enum: [true, false]
 *       - name: include_deleted
 *         in: query
 *         description: Include deleted collections (default excludes deleted collections)
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
 *           enum: [name, category, created_at, updated_at]
 *       - name: sort_order
 *         in: query
 *         description: Sort order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Collections retrieved successfully
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
 *                   example: "Collections fetched successfully"
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
 *                         example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *                       platform_id:
 *                         type: string
 *                         format: uuid
 *                         example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                       company_id:
 *                         type: string
 *                         format: uuid
 *                         example: "550e8400-e29b-41d4-a716-446655440000"
 *                       brand_id:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                       name:
 *                         type: string
 *                         example: "Event Package - Corporate"
 *                       description:
 *                         type: string
 *                         nullable: true
 *                         example: "Standard corporate event package"
 *                       images:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: []
 *                       category:
 *                         type: string
 *                         nullable: true
 *                         example: "Corporate Events"
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-23T16:20:00.000Z"
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-23T16:20:00.000Z"
 *                       deleted_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                         example: null
 *                       company:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "550e8400-e29b-41d4-a716-446655440000"
 *                           name:
 *                             type: string
 *                             example: "Diageo Events"
 *                           domain:
 *                             type: string
 *                             example: "diageo"
 *                       brand:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                           name:
 *                             type: string
 *                             example: "Johnnie Walker"
 *                           logo_url:
 *                             type: string
 *                             nullable: true
 *                             example: "https://example.com/logo.png"
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
 * /api/operations/v1/collection/{id}:
 *   get:
 *     tags:
 *       - Collection Management
 *     summary: Get a single collection by ID
 *     description: Retrieves detailed information about a specific collection including all its items and asset details. CLIENT role users can only see collections from their own company.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Collection unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *     responses:
 *       200:
 *         description: Collection retrieved successfully
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
 *                   example: "Collection fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     brand_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     name:
 *                       type: string
 *                       example: "Event Package - Corporate"
 *                     description:
 *                       type: string
 *                       nullable: true
 *                       example: "Standard corporate event package"
 *                     images:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["https://example.com/image1.jpg"]
 *                     category:
 *                       type: string
 *                       nullable: true
 *                       example: "Corporate Events"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T16:20:00.000Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T16:20:00.000Z"
 *                     deleted_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       example: null
 *                     company:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "550e8400-e29b-41d4-a716-446655440000"
 *                         name:
 *                           type: string
 *                           example: "Diageo Events"
 *                         domain:
 *                           type: string
 *                           example: "diageo"
 *                     brand:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                         name:
 *                           type: string
 *                           example: "Johnnie Walker"
 *                         logo_url:
 *                           type: string
 *                           nullable: true
 *                           example: "https://example.com/logo.png"
 *                     assets:
 *                       type: array
 *                       description: Collection items with asset details
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "item-uuid-1"
 *                           collection:
 *                             type: string
 *                             format: uuid
 *                             example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *                           asset:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                                 example: "asset-uuid-1"
 *                               name:
 *                                 type: string
 *                                 example: "Round Table"
 *                               category:
 *                                 type: string
 *                                 example: "FURNITURE"
 *                               images:
 *                                 type: array
 *                                 items:
 *                                   type: string
 *                                 example: []
 *                               qr_code:
 *                                 type: string
 *                                 example: "QR-TABLE-001"
 *                               available_quantity:
 *                                 type: integer
 *                                 example: 50
 *                               total_quantity:
 *                                 type: integer
 *                                 example: 100
 *                               volume_per_unit:
 *                                 type: string
 *                                 example: "0.500"
 *                               weight_per_unit:
 *                                 type: string
 *                                 example: "15.00"
 *                               status:
 *                                 type: string
 *                                 enum: [AVAILABLE, IN_USE, MAINTENANCE, RETIRED]
 *                                 example: "AVAILABLE"
 *                               condition:
 *                                 type: string
 *                                 enum: [GREEN, AMBER, RED]
 *                                 example: "GREEN"
 *                               handling_tags:
 *                                 type: array
 *                                 items:
 *                                   type: string
 *                                 example: ["FRAGILE"]
 *                           default_quantity:
 *                             type: integer
 *                             example: 10
 *                           notes:
 *                             type: string
 *                             nullable: true
 *                             example: "Standard setup"
 *                           display_order:
 *                             type: integer
 *                             nullable: true
 *                             example: 1
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-12-23T16:25:00.000Z"
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
 *         description: Not Found - Collection not found
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
 *                   example: "Collection not found"
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
 *       - Collection Management
 *     summary: Update a collection
 *     description: Updates an existing collection's information. Only ADMIN and LOGISTICS users can update collections. All fields are optional - only provided fields will be updated.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Collection unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               brand_id:
 *                 type: string
 *                 format: uuid
 *                 description: Brand ID
 *                 example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *                 description: Collection name
 *                 example: "Event Package - Premium Corporate"
 *               description:
 *                 type: string
 *                 description: Collection description
 *                 example: "Premium corporate event package"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of image URLs
 *                 example: ["https://example.com/new-image.jpg"]
 *               category:
 *                 type: string
 *                 maxLength: 50
 *                 description: Collection category
 *                 example: "Premium Events"
 *               is_active:
 *                 type: boolean
 *                 description: Collection active status
 *                 example: true
 *     responses:
 *       200:
 *         description: Collection updated successfully
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
 *                   example: "Collection updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *                     brand_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     name:
 *                       type: string
 *                       example: "Event Package - Premium Corporate"
 *                     description:
 *                       type: string
 *                       nullable: true
 *                       example: "Premium corporate event package"
 *                     images:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["https://example.com/new-image.jpg"]
 *                     category:
 *                       type: string
 *                       nullable: true
 *                       example: "Premium Events"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T16:20:00.000Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T18:30:00.000Z"
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
 *                   example: "Only administrators and logistics staff can update collections"
 *       404:
 *         description: Not Found - Collection or brand not found
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
 *                   example: "Collection not found"
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
 *       - Collection Management
 *     summary: Delete a collection
 *     description: Soft deletes a collection by setting its deleted_at timestamp. Only ADMIN users can delete collections.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Collection unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *     responses:
 *       200:
 *         description: Collection deleted successfully
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
 *                   example: "Collection deleted successfully"
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
 *                   example: "Only administrators can delete collections"
 *       404:
 *         description: Not Found - Collection not found
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
 *                   example: "Collection not found"
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
 * /api/operations/v1/collection/{id}/items:
 *   post:
 *     tags:
 *       - Collection Management
 *     summary: Add an item to a collection
 *     description: Adds an asset to a collection with specified quantity and display order. Only ADMIN and LOGISTICS users can add items.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Collection unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - asset_id
 *             properties:
 *               asset_id:
 *                 type: string
 *                 format: uuid
 *                 description: Asset ID to add to the collection
 *                 example: "asset-uuid-1"
 *               default_quantity:
 *                 type: integer
 *                 minimum: 1
 *                 default: 1
 *                 description: Default quantity of this asset in the collection
 *                 example: 10
 *               notes:
 *                 type: string
 *                 description: Notes about this item in the collection
 *                 example: "Standard setup configuration"
 *               display_order:
 *                 type: integer
 *                 description: Display order for sorting items
 *                 example: 1
 *     responses:
 *       201:
 *         description: Item added to collection successfully
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
 *                   example: "Item added to collection successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "item-uuid-1"
 *                     collection:
 *                       type: string
 *                       format: uuid
 *                       example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *                     asset:
 *                       type: string
 *                       format: uuid
 *                       example: "asset-uuid-1"
 *                     default_quantity:
 *                       type: integer
 *                       example: 10
 *                     notes:
 *                       type: string
 *                       nullable: true
 *                       example: "Standard setup configuration"
 *                     display_order:
 *                       type: integer
 *                       nullable: true
 *                       example: 1
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T16:25:00.000Z"
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
 *       404:
 *         description: Not Found - Collection or asset not found
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
 *                   example: "Collection not found"
 *       409:
 *         description: Conflict - Asset already exists in collection
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
 *                   example: "This asset is already in the collection"
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
 * /api/operations/v1/collection/{id}/items/{itemId}:
 *   patch:
 *     tags:
 *       - Collection Management
 *     summary: Update a collection item
 *     description: Updates a collection item's quantity, notes, or display order. Only ADMIN and LOGISTICS users can update items.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Collection unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *       - name: itemId
 *         in: path
 *         required: true
 *         description: Collection item unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "item-uuid-1"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               default_quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Default quantity of this asset in the collection
 *                 example: 15
 *               notes:
 *                 type: string
 *                 description: Notes about this item in the collection
 *                 example: "Updated configuration"
 *               display_order:
 *                 type: integer
 *                 description: Display order for sorting items
 *                 example: 2
 *     responses:
 *       200:
 *         description: Collection item updated successfully
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
 *                   example: "Collection item updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "item-uuid-1"
 *                     collection:
 *                       type: string
 *                       format: uuid
 *                       example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *                     asset:
 *                       type: string
 *                       format: uuid
 *                       example: "asset-uuid-1"
 *                     default_quantity:
 *                       type: integer
 *                       example: 15
 *                     notes:
 *                       type: string
 *                       nullable: true
 *                       example: "Updated configuration"
 *                     display_order:
 *                       type: integer
 *                       nullable: true
 *                       example: 2
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T16:25:00.000Z"
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
 *       404:
 *         description: Not Found - Collection or item not found
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
 *                   example: "Collection item not found"
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
 *       - Collection Management
 *     summary: Remove an item from a collection
 *     description: Removes an asset from a collection. Only ADMIN and LOGISTICS users can remove items.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Collection unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *       - name: itemId
 *         in: path
 *         required: true
 *         description: Collection item unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "item-uuid-1"
 *     responses:
 *       200:
 *         description: Collection item deleted successfully
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
 *                   example: "Collection item deleted successfully"
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
 *       404:
 *         description: Not Found - Collection or item not found
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
 *                   example: "Collection item not found"
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
 * /api/operations/v1/collection/{id}/availability:
 *   get:
 *     tags:
 *       - Collection Management
 *     summary: Check collection availability
 *     description: Checks if all items in a collection have sufficient available quantity for an event. Returns detailed availability information for each item.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Collection unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *       - name: event_start_date
 *         in: query
 *         required: true
 *         description: Event start date
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-12-25"
 *       - name: event_end_date
 *         in: query
 *         required: true
 *         description: Event end date
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-12-30"
 *     responses:
 *       200:
 *         description: Collection availability checked successfully
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
 *                   example: "Collection availability checked successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     collection_id:
 *                       type: string
 *                       format: uuid
 *                       example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *                     collection_name:
 *                       type: string
 *                       example: "Event Package - Corporate"
 *                     event_start_date:
 *                       type: string
 *                       example: "2025-12-25"
 *                     event_end_date:
 *                       type: string
 *                       example: "2025-12-30"
 *                     is_fully_available:
 *                       type: boolean
 *                       description: True if all items have sufficient quantity
 *                       example: true
 *                     items:
 *                       type: array
 *                       description: Availability details for each item
 *                       items:
 *                         type: object
 *                         properties:
 *                           asset_id:
 *                             type: string
 *                             format: uuid
 *                             example: "asset-uuid-1"
 *                           asset_name:
 *                             type: string
 *                             example: "Round Table"
 *                           default_quantity:
 *                             type: integer
 *                             description: Required quantity for this collection
 *                             example: 10
 *                           available_quantity:
 *                             type: integer
 *                             description: Currently available quantity
 *                             example: 50
 *                           total_quantity:
 *                             type: integer
 *                             description: Total quantity in inventory
 *                             example: 100
 *                           status:
 *                             type: string
 *                             enum: [AVAILABLE, IN_USE, MAINTENANCE, RETIRED]
 *                             example: "AVAILABLE"
 *                           condition:
 *                             type: string
 *                             enum: [GREEN, AMBER, RED]
 *                             example: "GREEN"
 *                           is_available:
 *                             type: boolean
 *                             description: True if available quantity >= default quantity
 *                             example: true
 *       400:
 *         description: Bad request - Missing required query parameters
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
 *                   example: "event_start_date and event_end_date are required in query parameters"
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
 *         description: Not Found - Collection not found
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
 *                   example: "Collection not found"
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
