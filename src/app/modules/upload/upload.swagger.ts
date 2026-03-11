/**
 * @swagger
 * tags:
 *   - name: Upload
 *     description: Image upload operations for S3 storage
 */

/**
 * @swagger
 * /api/operations/v1/upload/image:
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
 * /api/operations/v1/upload/images:
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

/**
 * @swagger
 * /api/operations/v1/upload/documents:
 *   post:
 *     tags:
 *       - Upload
 *     summary: Upload business documents
 *     description: |
 *       Upload one or more business documents using the strict `files` multipart field.
 *       This endpoint is intended for attachments such as purchase orders, permit files, and artwork reference documents.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: query
 *         name: draft
 *         required: false
 *         schema:
 *           type: boolean
 *         description: Optional draft-mode upload flag
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
 *                 description: PDF or image files to upload
 *               companyId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional company ID to organize uploads
 *     responses:
 *       200:
 *         description: Documents uploaded successfully
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
 *                   example: "Documents uploaded successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     documents:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           fileUrl:
 *                             type: string
 *                           fileName:
 *                             type: string
 *                           mimeType:
 *                             type: string
 *                           fileSizeBytes:
 *                             type: integer
 *       400:
 *         description: Bad request - No files provided
 *       401:
 *         description: Unauthorized - Authentication required
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

export const UploadSwagger = {};
