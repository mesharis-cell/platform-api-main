/**
 * @swagger
 * tags:
 *   - name: Order Transport Trips
 *     description: Order-scoped logistics transport trip planning and execution details
 */

/**
 * @swagger
 * /api/operations/v1/order/{id}/transport-trips:
 *   get:
 *     tags: [Order Transport Trips]
 *     summary: List transport trips for an order
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
 *         description: Transport trips fetched
 *     security:
 *       - BearerAuth: []
 *   post:
 *     tags: [Order Transport Trips]
 *     summary: Create transport trip for an order
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
 *             properties:
 *               leg_type:
 *                 type: string
 *                 enum: [DELIVERY, PICKUP, ACCESS, TRANSFER]
 *               truck_plate:
 *                 type: string
 *               driver_name:
 *                 type: string
 *               driver_contact:
 *                 type: string
 *               truck_size:
 *                 type: string
 *               manpower:
 *                 type: integer
 *               tailgate_required:
 *                 type: boolean
 *               notes:
 *                 type: string
 *               sequence_no:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Transport trip created
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/order/{id}/transport-trips/{tripId}:
 *   patch:
 *     tags: [Order Transport Trips]
 *     summary: Update transport trip for an order
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Transport trip updated
 *     security:
 *       - BearerAuth: []
 *   delete:
 *     tags: [Order Transport Trips]
 *     summary: Delete transport trip for an order
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Transport trip deleted
 *     security:
 *       - BearerAuth: []
 */
