/**
 * @swagger
 * tags:
 *   - name: Workflow Requests
 *     description: Internal workflow request operations
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
 *     summary: Update a workflow request
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
 *       required: [workflow_code, title]
 *       properties:
 *         workflow_code:
 *           type: string
 *           description: Stable workflow definition code, for example CREATIVE_SUPPORT
 *         title:
 *           type: string
 *         description:
 *           type: string
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
 *           description: Status value validated against the workflow definition status model
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         metadata:
 *           type: object
 *           additionalProperties: true
 *     WorkflowRequestRecord:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         workflow_definition_id:
 *           type: string
 *           format: uuid
 *         workflow_code:
 *           type: string
 *         workflow_label:
 *           type: string
 *         workflow_family:
 *           type: string
 *         status_model_key:
 *           type: string
 *         lifecycle_state:
 *           type: string
 *           enum: [OPEN, ACTIVE, DONE, CANCELLED]
 *         status:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *           nullable: true
 *         requested_at:
 *           type: string
 *           format: date-time
 */

export const WorkflowRequestSwagger = {};
