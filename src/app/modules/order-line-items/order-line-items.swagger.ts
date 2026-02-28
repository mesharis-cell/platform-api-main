/**
 * @swagger
 * tags:
 *   - name: Line Items
 *     description: Line item operations for ORDER, INBOUND_REQUEST, and SERVICE_REQUEST entities
 */

/**
 * @swagger
 * /api/operations/v1/line-item/{itemId}/metadata:
 *   patch:
 *     tags: [Line Items]
 *     summary: Patch line-item metadata and notes
 *     description: |
 *       Updates non-pricing fields (`metadata`, `notes`) for an existing line item.
 *       This endpoint remains available after quote lock.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: itemId
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
 *             properties:
 *               notes:
 *                 type: string
 *               metadata:
 *                 type: object
 *                 additionalProperties: true
 *     responses:
 *       200:
 *         description: Metadata updated
 *       400:
 *         description: Validation failure
 *       404:
 *         description: Line item not found
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/line-item/{itemId}/client-visibility:
 *   patch:
 *     tags: [Line Items]
 *     summary: Toggle client visibility for a single line item
 *     description: |
 *       Controls whether this line item amount is shown individually to client users and in client-facing estimates.
 *       When hidden, the line name remains visible and only the combined total is shown.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: itemId
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
 *             required: [client_price_visible]
 *             properties:
 *               client_price_visible:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Visibility updated
 *       404:
 *         description: Line item not found
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/line-item/client-visibility:
 *   patch:
 *     tags: [Line Items]
 *     summary: Bulk-toggle client visibility for an entity's line items
 *     description: |
 *       Sets `client_price_visible` for all (or selected) line items under one entity.
 *       Supported entities are ORDER, INBOUND_REQUEST, and SERVICE_REQUEST.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [purpose_type, client_price_visible]
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
 *               client_price_visible:
 *                 type: boolean
 *               line_item_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Optional subset; if omitted all active line items for entity are updated
 *     responses:
 *       200:
 *         description: Visibility updated
 *       400:
 *         description: Invalid payload
 *     security:
 *       - BearerAuth: []
 */
