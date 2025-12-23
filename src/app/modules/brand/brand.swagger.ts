/**
 * @swagger
 * /api/operations/v1/brand:
 *   post:
 *     tags:
 *       - Brand Management
 *     summary: Create a new brand
 *     description: Creates a new brand for a company. The platform ID is automatically extracted from the X-Platform header. Brand name must be unique within the company.
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
 *                 description: Company ID that owns this brand
 *                 example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Brand name (must be unique within the company)
 *                 example: "Nike"
 *               description:
 *                 type: string
 *                 description: Brand description (optional)
 *                 example: "Leading sportswear and athletic brand"
 *               logo_url:
 *                 type: string
 *                 format: uri
 *                 description: URL to brand logo (must start with http:// or https://, max 500 characters)
 *                 example: "https://cdn.example.com/logos/nike.png"
 *               is_active:
 *                 type: boolean
 *                 default: true
 *                 description: Brand active status
 *                 example: true
 *     responses:
 *       201:
 *         description: Brand created successfully
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
 *                   example: "Brand created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Brand unique identifier
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       description: Platform ID (from X-Platform header)
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                       description: Company ID that owns this brand
 *                       example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *                     name:
 *                       type: string
 *                       example: "Nike"
 *                     description:
 *                       type: string
 *                       nullable: true
 *                       example: "Leading sportswear and athletic brand"
 *                     logo_url:
 *                       type: string
 *                       nullable: true
 *                       example: "https://cdn.example.com/logos/nike.png"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       description: Brand creation timestamp
 *                       example: "2025-12-22T17:15:41.843Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       description: Brand last update timestamp
 *                       example: "2025-12-22T17:15:41.843Z"
 *       400:
 *         description: Bad request - Validation error or invalid logo URL
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
 *                   example: "Invalid logo URL format. Must start with http:// or https:// and be under 500 characters"
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
 *                   example: "Only platform administrators can create brands"
 *       404:
 *         description: Not Found - Company not found or archived
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
 *       409:
 *         description: Conflict - Brand name already exists for this company
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
 *                   example: "Brand with name \"Nike\" already exists for this company"
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
 *       - Brand Management
 *     summary: Get all brands
 *     description: Retrieves a paginated list of brands with their associated company information. Supports filtering by search term, company ID, and active status. Supports sorting by multiple fields. CLIENT role users can only see brands from their own company.
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
 *         description: Search brands by name (case-insensitive partial match)
 *         required: false
 *         schema:
 *           type: string
 *       - name: company_id
 *         in: query
 *         description: Filter brands by company ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: include_inactive
 *         in: query
 *         description: Include inactive brands (default shows only active brands)
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
 *           enum: [name, created_at, updated_at]
 *       - name: sort_order
 *         in: query
 *         description: Sort order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Brands retrieved successfully
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
 *                   example: "Brands fetched successfully"
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
 *                       company_id:
 *                         type: string
 *                         format: uuid
 *                         example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *                       name:
 *                         type: string
 *                         example: "Nike"
 *                       description:
 *                         type: string
 *                         nullable: true
 *                         example: "Leading sportswear and athletic brand"
 *                       logo_url:
 *                         type: string
 *                         nullable: true
 *                         example: "https://cdn.example.com/logos/nike.png"
 *                       is_active:
 *                         type: boolean
 *                         example: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-22T17:15:41.843Z"
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-22T17:15:41.843Z"
 *                       company:
 *                         type: object
 *                         description: Associated company information
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
 * /api/operations/v1/brand/{id}:
 *   get:
 *     tags:
 *       - Brand Management
 *     summary: Get a single brand by ID
 *     description: Retrieves detailed information about a specific brand including associated company information. CLIENT role users can only view brands from their own company.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Brand unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Brand retrieved successfully
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
 *                   example: "Brand fetched successfully"
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
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                       example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *                     name:
 *                       type: string
 *                       example: "Nike"
 *                     description:
 *                       type: string
 *                       nullable: true
 *                       example: "Leading sportswear and athletic brand"
 *                     logo_url:
 *                       type: string
 *                       nullable: true
 *                       example: "https://cdn.example.com/logos/nike.png"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-22T17:15:41.843Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-22T17:15:41.843Z"
 *                     company:
 *                       type: object
 *                       description: Associated company information
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
 *         description: Not Found - Brand not found or user doesn't have access
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
 *                   example: "Brand not found"
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
 *       - Brand Management
 *     summary: Update a brand
 *     description: Updates an existing brand's information. Only ADMIN users can update brands. All fields are optional - only provided fields will be updated.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Brand unique identifier (UUID)
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
 *                 description: Brand name (must be unique within the company)
 *                 example: "Nike Sports"
 *               description:
 *                 type: string
 *                 description: Brand description
 *                 example: "Updated brand description"
 *               logo_url:
 *                 type: string
 *                 format: uri
 *                 description: URL to brand logo (must start with http:// or https://)
 *                 example: "https://cdn.example.com/logos/nike-updated.png"
 *               is_active:
 *                 type: boolean
 *                 description: Brand active status
 *                 example: true
 *     responses:
 *       200:
 *         description: Brand updated successfully
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
 *                   example: "Brand updated successfully"
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
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                       example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *                     name:
 *                       type: string
 *                       example: "Nike Sports"
 *                     description:
 *                       type: string
 *                       nullable: true
 *                       example: "Updated brand description"
 *                     logo_url:
 *                       type: string
 *                       nullable: true
 *                       example: "https://cdn.example.com/logos/nike-updated.png"
 *                     is_active:
 *                       type: boolean
 *                       example: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-22T17:15:41.843Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-23T14:30:22.156Z"
 *       400:
 *         description: Bad request - Validation error or invalid logo URL
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
 *                   example: "Invalid logo URL format. Must start with http:// or https:// and be under 500 characters"
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
 *                   example: "Only platform administrators can update brands"
 *       404:
 *         description: Not Found - Brand not found
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
 *                   example: "Brand not found"
 *       409:
 *         description: Conflict - Brand name already exists for this company
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
 *                   example: "Brand with name \"Nike Sports\" already exists for this company"
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
 *       - Brand Management
 *     summary: Delete a brand
 *     description: Deletes (deactivates) a brand by setting its is_active status to false. Only ADMIN users can delete brands. This is a soft delete operation.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Brand unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Brand deleted successfully
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
 *                   example: "Brand deleted successfully"
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
 *                   example: "Only platform administrators can delete brands"
 *       404:
 *         description: Not Found - Brand not found
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
 *                   example: "Brand not found"
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

