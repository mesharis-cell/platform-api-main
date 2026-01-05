/**
 * @swagger
 * tags:
 *   - name: Upload
 *     description: Image upload operations for S3 storage
 */

/**
 * @swagger
 * /api/operation/v1/upload/image:
 *   post:
 *     tags:
 *       - Upload
 *     summary: Upload a single image
 *     description: Upload a single image to S3 storage. Optionally provide a companyId to organize images by company.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Image file to upload
 *               companyId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional company ID to organize images
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Image uploaded successfully
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
 *                   example: "Image uploaded successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     imageUrl:
 *                       type: string
 *                       description: URL of the uploaded image
 *                       example: "https://s3.amazonaws.com/bucket/company-id/image.jpg"
 *       400:
 *         description: Bad request - No file provided
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
 * /api/operation/v1/upload/images:
 *   post:
 *     tags:
 *       - Upload
 *     summary: Upload multiple images
 *     description: Upload multiple images to S3 storage. Optionally provide a companyId to organize images by company.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - files
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Array of image files to upload
 *               companyId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional company ID to organize images
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Images uploaded successfully
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
 *                   example: "Images uploaded successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     imageUrls:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Array of URLs of the uploaded images
 *                       example: ["https://s3.amazonaws.com/bucket/company-id/image1.jpg", "https://s3.amazonaws.com/bucket/company-id/image2.jpg"]
 *       400:
 *         description: Bad request - No files provided
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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

export const UploadSwagger = {};
