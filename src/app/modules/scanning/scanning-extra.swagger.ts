/**
 * @swagger
 * /api/operations/v1/scanning/outbound/{order_id}/truck-photos:
 *   post:
 *     tags: [Scanning]
 *     summary: Upload truck photos for outbound or return phase
 *     description: |
 *       Captures truck/loading evidence photos.
 *       `trip_phase` controls whether photos are stored for delivery (`OUTBOUND`) or return pickup (`RETURN`).
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: order_id
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
 *                       description: Publicly accessible uploaded image URL
 *                     note:
 *                       type: string
 *               asset_ids:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: Optional subset of order assets linked to this capture
 *               note:
 *                 type: string
 *                 description: Optional note for the capture event
 *               trip_phase:
 *                 type: string
 *                 enum: [OUTBOUND, RETURN]
 *                 default: OUTBOUND
 *                 description: RETURN is valid during AWAITING_RETURN and RETURN_IN_TRANSIT
 *     responses:
 *       200:
 *         description: Truck photos uploaded
 *       400:
 *         description: Invalid payload or invalid order status for selected phase
 *       404:
 *         description: Order not found
 *     security:
 *       - BearerAuth: []
 */
