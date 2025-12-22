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
 */
