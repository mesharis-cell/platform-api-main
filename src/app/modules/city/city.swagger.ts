/**
 * @swagger
 * /api/operations/v1/city:
 *   post:
 *     tags:
 *       - City Management
 *     summary: Create a new city
 *     description: Creates a new city for a country. The platform ID is automatically extracted from the X-Platform header. City name must be unique within the platform and country combination.
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
 *               - country_id
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: City name (must be unique within the country)
 *                 example: "Dubai"
 *               country_id:
 *                 type: string
 *                 format: uuid
 *                 description: Country ID that this city belongs to
 *                 example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       201:
 *         description: City created successfully
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
 *                   example: "City created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     name:
 *                       type: string
 *                       example: "Dubai"
 *                     country_id:
 *                       type: string
 *                       format: uuid
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-22T17:15:41.843Z"
 *       400:
 *         description: Bad request - Validation error
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Not Found - Country not found
 *       409:
 *         description: Conflict - City name already exists for this country
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 *   get:
 *     tags:
 *       - City Management
 *     summary: Get all cities
 *     description: Retrieves a paginated list of cities with their associated country information. Supports filtering by search term and country. Supports sorting by multiple fields.
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
 *         description: Search cities by name (case-insensitive partial match)
 *         required: false
 *         schema:
 *           type: string
 *       - name: country_id
 *         in: query
 *         description: Filter cities by country ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: sort_by
 *         in: query
 *         description: Field to sort by
 *         required: false
 *         schema:
 *           type: string
 *           enum: [name, created_at]
 *       - name: sort_order
 *         in: query
 *         description: Sort order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Cities retrieved successfully
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
 *                   example: "Cities fetched successfully"
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
 *                         example: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                       platform_id:
 *                         type: string
 *                         format: uuid
 *                         example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                       name:
 *                         type: string
 *                         example: "Dubai"
 *                       country_id:
 *                         type: string
 *                         format: uuid
 *                         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-12-22T17:15:41.843Z"
 *                       country:
 *                         type: object
 *                         description: Associated country information
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                           name:
 *                             type: string
 *                             example: "United Arab Emirates"
 *       400:
 *         description: Bad request - Invalid query parameters
 *       401:
 *         description: Unauthorized - Authentication required
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/city/{id}:
 *   get:
 *     tags:
 *       - City Management
 *     summary: Get a single city by ID
 *     description: Retrieves detailed information about a specific city including associated country information.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: City unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *     responses:
 *       200:
 *         description: City retrieved successfully
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
 *                   example: "City fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     name:
 *                       type: string
 *                       example: "Dubai"
 *                     country_id:
 *                       type: string
 *                       format: uuid
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-22T17:15:41.843Z"
 *                     country:
 *                       type: object
 *                       description: Associated country information
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                         name:
 *                           type: string
 *                           example: "United Arab Emirates"
 *       401:
 *         description: Unauthorized - Authentication required
 *       404:
 *         description: Not Found - City not found
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 *   patch:
 *     tags:
 *       - City Management
 *     summary: Update a city
 *     description: Updates an existing city's information. Only ADMIN users can update cities. All fields are optional - only provided fields will be updated.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: City unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
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
 *                 maxLength: 255
 *                 description: City name (must be unique within the country)
 *                 example: "Dubai"
 *               country_id:
 *                 type: string
 *                 format: uuid
 *                 description: Country ID that this city belongs to
 *                 example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: City updated successfully
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
 *                   example: "City updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                       example: "593c027e-0774-4b0b-ae46-ec59c4f11304"
 *                     name:
 *                       type: string
 *                       example: "Dubai"
 *                     country_id:
 *                       type: string
 *                       format: uuid
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-12-22T17:15:41.843Z"
 *       400:
 *         description: Bad request - Validation error
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Not Found - City or Country not found
 *       409:
 *         description: Conflict - City name already exists for this country
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     tags:
 *       - City Management
 *     summary: Delete a city
 *     description: Deletes a city. Only ADMIN users can delete cities.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: City unique identifier (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *     responses:
 *       200:
 *         description: City deleted successfully
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
 *                   example: "City deleted successfully"
 *                 data:
 *                   type: "null"
 *                   nullable: true
 *                   example: null
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Not Found - City not found
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */
