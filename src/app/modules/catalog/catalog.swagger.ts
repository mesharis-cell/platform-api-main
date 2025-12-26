/**
 * @swagger
 * tags:
 *   - name: Catalog
 *     description: Asset and Collection Catalog Browsing
 */

/**
 * @swagger
 * /api/clients/v1/catalog:
 *   get:
 *     tags:
 *       - Catalog
 *     summary: Browse catalog
 *     description: Retrieve a list of assets and collections with filtering options. Accessible by ADMIN, LOGISTICS, and CLIENT users.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'

 *       - name: brand
 *         in: query
 *         description: Filter by Brand ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: category
 *         in: query
 *         description: Filter by category name
 *         required: false
 *         schema:
 *           type: string
 *       - name: search_term
 *         in: query
 *         description: Search term for name, description, or QR code
 *         required: false
 *         schema:
 *           type: string
 *       - name: type
 *         in: query
 *         description: Type of items to retrieve (asset, collection, or all)
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asset, collection, all]
 *           default: all
 *       - name: limit
 *         in: query
 *         description: Number of items to retrieve
 *         required: false
 *         schema:
 *           type: integer
 *           default: 50
 *       - name: page
 *         in: query
 *         description: Page number
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *     responses:
 *       200:
 *         description: Catalog retrieved successfully
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
 *                   example: "Catalog fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     assets:
 *                       type: array
 *                       description: List of assets found
 *                       items:
 *                         $ref: '#/components/schemas/Asset'
 *                     collections:
 *                       type: array
 *                       description: List of collections found
 *                       items:
 *                         $ref: '#/components/schemas/Collection'
 *                     meta:
 *                       type: object
 *                       properties:
 *                         total_assets:
 *                           type: integer
 *                           description: Total count of matching assets
 *                           example: 10
 *                         total_collections:
 *                           type: integer
 *                           description: Total count of matching collections
 *                           example: 5
 *       401:
 *         description: Unauthorized - Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         category:
 *           type: string
 *         images:
 *           type: array
 *           items:
 *             type: string
 *         total_quantity:
 *           type: integer
 *         available_quantity:
 *           type: integer
 *         qr_code:
 *           type: string
 *         status:
 *           type: string
 *           enum: [AVAILABLE, BOOKED, OUT, MAINTENANCE]
 *         brand:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *             name:
 *               type: string
 *         company:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *             name:
 *               type: string
 *
 *     Collection:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         category:
 *           type: string
 *         images:
 *           type: array
 *           items:
 *             type: string
 *         brand:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *             name:
 *               type: string
 *         company:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *             name:
 *               type: string
 */

export const CatalogSwagger = {};
