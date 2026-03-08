/**
 * @swagger
 * tags:
 *   - name: Attachment Types
 *     description: Admin-managed attachment type configuration
 */

/**
 * @swagger
 * /api/operations/v1/attachment-types:
 *   get:
 *     tags: [Attachment Types]
 *     summary: List attachment types
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     responses:
 *       200:
 *         description: Attachment types returned
 *     security:
 *       - BearerAuth: []
 *   post:
 *     tags: [Attachment Types]
 *     summary: Create attachment type
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AttachmentTypeInput'
 *     responses:
 *       201:
 *         description: Attachment type created
 *     security:
 *       - BearerAuth: []
 *
 * /api/operations/v1/attachment-types/{id}:
 *   patch:
 *     tags: [Attachment Types]
 *     summary: Update attachment type
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AttachmentTypeInput'
 *     responses:
 *       200:
 *         description: Attachment type updated
 *     security:
 *       - BearerAuth: []
 *
 * components:
 *   schemas:
 *     AttachmentTypeInput:
 *       type: object
 *       properties:
 *         code:
 *           type: string
 *           example: "PO_DOCUMENT"
 *         label:
 *           type: string
 *           example: "PO Document"
 *         allowed_entity_types:
 *           type: array
 *           items:
 *             type: string
 *             enum: [ORDER, INBOUND_REQUEST, SERVICE_REQUEST, WORKFLOW_REQUEST]
 *         default_visible_to_client:
 *           type: boolean
 *         is_active:
 *           type: boolean
 *         sort_order:
 *           type: integer
 */

export const AttachmentTypesSwagger = {};
