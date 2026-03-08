/**
 * @swagger
 * tags:
 *   - name: Attachments
 *     description: Business document attachment operations for supported entity types
 */

/**
 * @swagger
 * /api/operations/v1/order/{id}/attachments:
 *   get:
 *     tags: [Attachments]
 *     summary: List order attachments
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Attachment list returned
 *     security:
 *       - BearerAuth: []
 *   post:
 *     tags: [Attachments]
 *     summary: Attach business documents to an order
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
 *             type: object
 *             required: [attachments]
 *             properties:
 *               attachments:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   $ref: '#/components/schemas/EntityAttachmentInput'
 *     responses:
 *       201:
 *         description: Attachments created
 *     security:
 *       - BearerAuth: []
 *
 * /api/operations/v1/inbound-request/{id}/attachments:
 *   get:
 *     tags: [Attachments]
 *     summary: List inbound request attachments
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Attachment list returned
 *     security:
 *       - BearerAuth: []
 *   post:
 *     tags: [Attachments]
 *     summary: Attach business documents to an inbound request
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
 *             type: object
 *             required: [attachments]
 *             properties:
 *               attachments:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   $ref: '#/components/schemas/EntityAttachmentInput'
 *     responses:
 *       201:
 *         description: Attachments created
 *     security:
 *       - BearerAuth: []
 *
 * /api/operations/v1/service-request/{id}/attachments:
 *   get:
 *     tags: [Attachments]
 *     summary: List service request attachments
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Attachment list returned
 *     security:
 *       - BearerAuth: []
 *   post:
 *     tags: [Attachments]
 *     summary: Attach business documents to a service request
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
 *             type: object
 *             required: [attachments]
 *             properties:
 *               attachments:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   $ref: '#/components/schemas/EntityAttachmentInput'
 *     responses:
 *       201:
 *         description: Attachments created
 *     security:
 *       - BearerAuth: []
 *
 * /api/operations/v1/attachments/{id}:
 *   delete:
 *     tags: [Attachments]
 *     summary: Delete an attachment
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Attachment deleted
 *     security:
 *       - BearerAuth: []
 *
 * components:
 *   schemas:
 *     EntityAttachmentInput:
 *       type: object
 *       required: [attachment_type_id, file_url, file_name, mime_type]
 *       properties:
 *         attachment_type_id:
 *           type: string
 *           format: uuid
 *         file_url:
 *           type: string
 *           format: uri
 *         file_name:
 *           type: string
 *         mime_type:
 *           type: string
 *         file_size_bytes:
 *           type: integer
 *         note:
 *           type: string
 *         visible_to_client:
 *           type: boolean
 */

export const AttachmentsSwagger = {};
