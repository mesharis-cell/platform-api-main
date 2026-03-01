/**
 * @swagger
 * tags:
 *   - name: Line Item Requests
 *     description: Warehouse-requested line item workflow for admin approval
 */

/**
 * @swagger
 * /api/operations/v1/line-item-requests:
 *   get:
 *     tags: [Line Item Requests]
 *     summary: List line item requests
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     responses:
 *       200:
 *         description: Line item requests fetched
 *     security:
 *       - BearerAuth: []
 *   post:
 *     tags: [Line Item Requests]
 *     summary: Create a line item request
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [purpose_type, description, category, quantity, unit, unit_rate]
 *             properties:
 *               purpose_type:
 *                 type: string
 *                 enum: [ORDER, INBOUND_REQUEST, SERVICE_REQUEST]
 *               order_id:
 *                 type: string
 *                 format: uuid
 *               inbound_request_id:
 *                 type: string
 *                 format: uuid
 *               service_request_id:
 *                 type: string
 *                 format: uuid
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [ASSEMBLY, EQUIPMENT, HANDLING, RESKIN, TRANSPORT, OTHER]
 *               quantity:
 *                 type: number
 *               unit:
 *                 type: string
 *               unit_rate:
 *                 type: number
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Line item request created
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/line-item-requests/{id}/approve:
 *   patch:
 *     tags: [Line Item Requests]
 *     summary: Approve a line item request and auto-attach resulting line item
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Line item request approved
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/line-item-requests/{id}/reject:
 *   patch:
 *     tags: [Line Item Requests]
 *     summary: Reject a line item request
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Line item request rejected
 *     security:
 *       - BearerAuth: []
 */
