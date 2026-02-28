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
 *                   required: [order_item_id, photos]
 *                   properties:
 *                     order_item_id:
 *                       type: string
 *                       format: uuid
 *                     photos:
 *                       type: array
 *                       minItems: 1
 *                       items:
 *                         type: string
 *                     notes:
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
 * /api/client/v1/order/{id}/on-site-photos:
 *   patch:
 *     tags: [Order Management]
 *     summary: Save on-site photos for IN_USE stage
 *     description: |
 *       Saves photos captured when items are installed/on site.
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
 *             required: [photos]
 *             properties:
 *               photos:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: On-site photos saved
 *       400:
 *         description: Invalid payload or invalid order status
 *       404:
 *         description: Order not found
 *     security:
 *       - BearerAuth: []
 */
