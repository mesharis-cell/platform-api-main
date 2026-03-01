/**
 * @swagger
 * /api/client/v1/order/{id}/derig:
 *   patch:
 *     tags: [Order Management]
 *     summary: Save derig capture per order item
 *     description: |
 *       Saves derig photos and optional notes for each order item.
 *       Allowed only when order status is `DERIG`.
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
 *             required: [items]
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [order_item_id, media]
 *                   properties:
 *                     order_item_id:
 *                       type: string
 *                       format: uuid
 *                     media:
 *                       type: array
 *                       minItems: 1
 *                       items:
 *                         type: object
 *                         required: [url]
 *                         properties:
 *                           url:
 *                             type: string
 *                           note:
 *                             type: string
 *                     note:
 *                       type: string
 *     responses:
 *       200:
 *         description: Derig capture saved
 *       400:
 *         description: Invalid payload or invalid order status
 *       404:
 *         description: Order not found
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/{id}/on-site-capture:
 *   patch:
 *     tags: [Order Management]
 *     summary: Save on-site capture media for IN_USE stage
 *     description: |
 *       Saves capture evidence when items are installed/on site.
 *       Allowed only when order status is `IN_USE`.
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
 *             required: [media]
 *             properties:
 *               media:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: object
 *                   required: [url]
 *                   properties:
 *                     url:
 *                       type: string
 *                     note:
 *                       type: string
 *               asset_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: On-site capture saved
 *       400:
 *         description: Invalid payload or invalid order status
 *       404:
 *         description: Order not found
 *     security:
 *       - BearerAuth: []
 */
