/**
 * @swagger
 * /api/client/v1/inbound-request:
 *   post:
 *     tags:
 *       - Inbound Request
 *     summary: Create a new inbound request
 *     description: Creates a new inbound request for a company to send items to the warehouse.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - company_id
 *               - incoming_at
 *               - items
 *             properties:
 *               company_id:
 *                 type: string
 *                 format: uuid
 *                 description: Company ID
 *                 example: "e9f0041c-84c0-4396-8b7e-72b804a4695d"
 *               note:
 *                 type: string
 *                 description: Optional note for the request
 *                 example: "Please receive these items asap"
 *               incoming_at:
 *                 type: string
 *                 format: date-time
 *                 description: Expected incoming date and time
 *                 example: "2025-12-25T10:00:00Z"
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - category
 *                     - tracking_method
 *                     - quantity
 *                     - weight_per_unit
 *                     - volume_per_unit
 *                   properties:
 *                     brand_id:
 *                       type: string
 *                       format: uuid
 *                       description: Optional Brand ID
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     name:
 *                       type: string
 *                       description: Item name
 *                       example: "Red Chair"
 *                     description:
 *                       type: string
 *                       description: Item description
 *                       example: "A comfortable red chair"
 *                     category:
 *                       type: string
 *                       description: Item category
 *                       example: "FURNITURE"
 *                     tracking_method:
 *                       type: string
 *                       enum: [INDIVIDUAL, BATCH]
 *                       description: Tracking method
 *                       example: "INDIVIDUAL"
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                       description: Quantity of items
 *                       example: 10
 *                     packaging:
 *                       type: string
 *                       description: Packaging details
 *                       example: "Boxed"
 *                     weight_per_unit:
 *                       type: number
 *                       format: float
 *                       description: Weight per unit in kg
 *                       example: 5.5
 *                     dimensions:
 *                       type: object
 *                       properties:
 *                         length:
 *                           type: number
 *                           example: 50
 *                         width:
 *                           type: number
 *                           example: 50
 *                         height:
 *                           type: number
 *                           example: 100
 *                     volume_per_unit:
 *                       type: number
 *                       format: float
 *                       description: Volume per unit in cubic meters
 *                       example: 0.25
 *                     handling_tags:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["FRAGILE", "HEAVY"]
 *     responses:
 *       201:
 *         description: Inbound request created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Inbound request created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *       400:
 *         description: Bad request - Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Company not found
 *       500:
 *         description: Internal server error
 */
