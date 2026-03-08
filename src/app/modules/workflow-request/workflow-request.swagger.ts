/**
 * @swagger
 * tags:
 *   - name: Workflow Requests
 *     description: Internal workflow escalation operations
 */

/**
 * @swagger
 * /api/operations/v1/order/{id}/workflow-requests:
 *   get:
 *     tags: [Workflow Requests]
 *     summary: List workflow requests for an order
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
 *         description: Workflow request list returned
 *     security:
 *       - BearerAuth: []
 *   post:
 *     tags: [Workflow Requests]
 *     summary: Create workflow request for an order
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
 *             $ref: '#/components/schemas/WorkflowRequestCreateInput'
 *     responses:
 *       201:
 *         description: Workflow request created
 *     security:
 *       - BearerAuth: []
 *
 * /api/operations/v1/inbound-request/{id}/workflow-requests:
 *   get:
 *     tags: [Workflow Requests]
 *     summary: List workflow requests for an inbound request
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
 *         description: Workflow request list returned
 *     security:
 *       - BearerAuth: []
 *   post:
 *     tags: [Workflow Requests]
 *     summary: Create workflow request for an inbound request
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
 *             $ref: '#/components/schemas/WorkflowRequestCreateInput'
 *     responses:
 *       201:
 *         description: Workflow request created
 *     security:
 *       - BearerAuth: []
 *
 * /api/operations/v1/service-request/{id}/workflow-requests:
 *   get:
 *     tags: [Workflow Requests]
 *     summary: List workflow requests for a service request
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
 *         description: Workflow request list returned
 *     security:
 *       - BearerAuth: []
 *   post:
 *     tags: [Workflow Requests]
 *     summary: Create workflow request for a service request
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
 *             $ref: '#/components/schemas/WorkflowRequestCreateInput'
 *     responses:
 *       201:
 *         description: Workflow request created
 *     security:
 *       - BearerAuth: []
 *
 * /api/operations/v1/workflow-request/{id}:
 *   patch:
 *     tags: [Workflow Requests]
 *     summary: Update workflow request
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
 *             $ref: '#/components/schemas/WorkflowRequestUpdateInput'
 *     responses:
 *       200:
 *         description: Workflow request updated
 *     security:
 *       - BearerAuth: []
 *
 * components:
 *   schemas:
 *     WorkflowAttachmentInput:
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
 *     WorkflowRequestCreateInput:
 *       type: object
 *       required: [workflow_kind, title]
 *       properties:
 *         workflow_kind:
 *           type: string
 *           enum: [ARTWORK_SUPPORT]
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         assigned_email:
 *           type: string
 *           format: email
 *         metadata:
 *           type: object
 *           additionalProperties: true
 *         attachments:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/WorkflowAttachmentInput'
 *     WorkflowRequestUpdateInput:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [REQUESTED, ACKNOWLEDGED, IN_PROGRESS, COMPLETED, CANCELLED]
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         assigned_email:
 *           type: string
 *           format: email
 *           nullable: true
 *         metadata:
 *           type: object
 *           additionalProperties: true
 */

export const WorkflowRequestSwagger = {};
