/**
 * @swagger
 * /api/operations/v1/scanning/inbound/{order_id}/scan:
 *   post:
 *     tags:
 *       - Scanning
 *     summary: Scan item inbound (warehouse return)
 *     description: |
 *       Records an inbound scan when items are returned to the warehouse after an event.
 *       This stateless endpoint writes directly to scan_events table and updates asset quantities.
 *       
 *       **Features:**
 *       - QR code-based asset identification
 *       - Condition inspection (GREEN/ORANGE/RED)
 *       - Support for both INDIVIDUAL and BATCH tracking
 *       - Automatic asset quantity updates
 *       - Condition history tracking
 *       - Real-time progress calculation
 *       - Over-scanning prevention
 *       
 *       **Permissions Required**: Only ADMIN and LOGISTICS roles can scan items
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: order_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order ID
 *         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - qr_code
 *               - condition
 *             properties:
 *               qr_code:
 *                 type: string
 *                 minLength: 1
 *                 description: QR code of the asset being scanned
 *                 example: "ASSET-001-2025"
 *               condition:
 *                 type: string
 *                 enum: [GREEN, ORANGE, RED]
 *                 description: |
 *                   Asset condition after return:
 *                   - GREEN: Good condition, ready for reuse
 *                   - ORANGE: Minor damage, needs inspection
 *                   - RED: Damaged, requires maintenance/refurbishment
 *                 example: "GREEN"
 *               notes:
 *                 type: string
 *                 description: Optional notes about the condition or return
 *                 example: "Minor scratches on the surface, but fully functional"
 *               photos:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of photo URLs documenting the condition
 *                 example: ["https://storage.example.com/damage-photo-1.jpg"]
 *               refurb_days_estimate:
 *                 type: integer
 *                 minimum: 1
 *                 description: Estimated days for refurbishment (required for ORANGE/RED condition)
 *                 example: 5
 *               discrepancy_reason:
 *                 type: string
 *                 enum: [BROKEN, LOST, OTHER]
 *                 description: Reason for discrepancy if item is damaged or missing
 *                 example: "BROKEN"
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Quantity to scan (required for BATCH tracking assets)
 *                 example: 10
 *           examples:
 *             greenCondition:
 *               summary: Item returned in good condition
 *               value:
 *                 qr_code: "ASSET-001-2025"
 *                 condition: "GREEN"
 *                 notes: "All items returned in excellent condition"
 *             damagedItem:
 *               summary: Item returned damaged (RED)
 *               value:
 *                 qr_code: "ASSET-002-2025"
 *                 condition: "RED"
 *                 notes: "Severe damage to frame, needs replacement parts"
 *                 photos:
 *                   - "https://storage.example.com/damage-photo-1.jpg"
 *                   - "https://storage.example.com/damage-photo-2.jpg"
 *                 refurb_days_estimate: 7
 *                 discrepancy_reason: "BROKEN"
 *             batchScan:
 *               summary: Batch scan of multiple units
 *               value:
 *                 qr_code: "BATCH-CHAIRS-001"
 *                 condition: "ORANGE"
 *                 quantity: 15
 *                 notes: "Some chairs have loose screws, need tightening"
 *                 refurb_days_estimate: 2
 *     responses:
 *       200:
 *         description: Item scanned successfully
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
 *                   example: "Item scanned in successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     asset:
 *                       type: object
 *                       description: Updated asset information
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                         qr_code:
 *                           type: string
 *                         condition:
 *                           type: string
 *                           enum: [GREEN, ORANGE, RED]
 *                         total_quantity:
 *                           type: integer
 *                         available_quantity:
 *                           type: integer
 *                         out_quantity:
 *                           type: integer
 *                         status:
 *                           type: string
 *                           enum: [AVAILABLE, BOOKED, OUT, MAINTENANCE]
 *                     progress:
 *                       type: object
 *                       description: Scan progress for this order
 *                       properties:
 *                         items_scanned:
 *                           type: integer
 *                           description: Total items scanned in so far
 *                           example: 15
 *                         total_items:
 *                           type: integer
 *                           description: Total items in the order
 *                           example: 50
 *                         percent_complete:
 *                           type: integer
 *                           description: Percentage of items scanned
 *                           example: 30
 *             example:
 *               success: true
 *               message: "Item scanned in successfully"
 *               data:
 *                 asset:
 *                   id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                   name: "Display Stand - Premium"
 *                   qr_code: "ASSET-001-2025"
 *                   condition: "GREEN"
 *                   total_quantity: 50
 *                   available_quantity: 30
 *                   out_quantity: 20
 *                   status: "AVAILABLE"
 *                 progress:
 *                   items_scanned: 15
 *                   total_items: 50
 *                   percent_complete: 30
 *       400:
 *         description: Bad request - Validation errors or business rule violations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *             examples:
 *               missingQrCode:
 *                 summary: QR code not provided
 *                 value:
 *                   success: false
 *                   message: "QR code is required"
 *               invalidCondition:
 *                 summary: Invalid condition value
 *                 value:
 *                   success: false
 *                   message: "Condition must be GREEN, ORANGE, or RED"
 *               assetNotInOrder:
 *                 summary: Asset not part of this order
 *                 value:
 *                   success: false
 *                   message: "Asset not in this order"
 *               quantityRequired:
 *                 summary: Quantity missing for batch asset
 *                 value:
 *                   success: false
 *                   message: "Quantity required for BATCH assets"
 *               overScanning:
 *                 summary: Attempting to scan more than required
 *                 value:
 *                   success: false
 *                   message: "Cannot scan 10 units. Already scanned: 45, Required: 50"
 *       401:
 *         description: Unauthorized - Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "You are not authorized"
 *       403:
 *         description: Forbidden - Only warehouse staff can scan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Only warehouse staff can scan items"
 *       404:
 *         description: Not Found - Order or asset not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *             examples:
 *               orderNotFound:
 *                 summary: Order not found
 *                 value:
 *                   success: false
 *                   message: "Order not found"
 *               assetNotFound:
 *                 summary: Asset not found by QR code
 *                 value:
 *                   success: false
 *                   message: "Asset not found with this QR code"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong!"
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/scanning/inbound/{order_id}/progress:
 *   get:
 *     tags:
 *       - Scanning
 *     summary: Get inbound scanning progress for an order
 *     description: |
 *       Retrieves detailed scanning progress for a specific order, showing how many items
 *       have been scanned back into the warehouse versus the total required.
 *       
 *       **Features:**
 *       - Overall progress percentage
 *       - Per-asset breakdown of scanned vs required quantities
 *       - Completion status for each asset
 *       - Asset tracking method visibility
 *       
 *       **Permissions Required**: Only ADMIN and LOGISTICS roles can view progress
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: order_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order ID
 *         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Progress retrieved successfully
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
 *                   example: "Scan progress retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     order_id:
 *                       type: string
 *                       description: Human-readable order ID
 *                       example: "ORD-20251227-001"
 *                     order_status:
 *                       type: string
 *                       description: Current order status
 *                       example: "IN_USE"
 *                     total_items:
 *                       type: integer
 *                       description: Total items in the order
 *                       example: 100
 *                     items_scanned:
 *                       type: integer
 *                       description: Total items scanned back in
 *                       example: 75
 *                     percent_complete:
 *                       type: integer
 *                       description: Percentage of items scanned
 *                       example: 75
 *                     assets:
 *                       type: array
 *                       description: Per-asset scanning progress
 *                       items:
 *                         type: object
 *                         properties:
 *                           asset_id:
 *                             type: string
 *                             format: uuid
 *                           asset_name:
 *                             type: string
 *                             example: "Banquet Chair - Gold"
 *                           qr_code:
 *                             type: string
 *                             example: "ASSET-CHAIR-001"
 *                           tracking_method:
 *                             type: string
 *                             enum: [INDIVIDUAL, BATCH]
 *                             example: "BATCH"
 *                           required_quantity:
 *                             type: integer
 *                             description: Quantity sent out with order
 *                             example: 50
 *                           scanned_quantity:
 *                             type: integer
 *                             description: Quantity scanned back in
 *                             example: 45
 *                           is_complete:
 *                             type: boolean
 *                             description: Whether all units have been scanned
 *                             example: false
 *             example:
 *               success: true
 *               message: "Scan progress retrieved successfully"
 *               data:
 *                 order_id: "ORD-20251227-001"
 *                 order_status: "IN_USE"
 *                 total_items: 100
 *                 items_scanned: 75
 *                 percent_complete: 75
 *                 assets:
 *                   - asset_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     asset_name: "Banquet Chair - Gold"
 *                     qr_code: "ASSET-CHAIR-001"
 *                     tracking_method: "BATCH"
 *                     required_quantity: 50
 *                     scanned_quantity: 45
 *                     is_complete: false
 *                   - asset_id: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                     asset_name: "Display Stand - Premium"
 *                     qr_code: "ASSET-STAND-001"
 *                     tracking_method: "INDIVIDUAL"
 *                     required_quantity: 25
 *                     scanned_quantity: 25
 *                     is_complete: true
 *       401:
 *         description: Unauthorized - Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "You are not authorized"
 *       403:
 *         description: Forbidden - Only warehouse staff can view progress
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Only warehouse staff can view scan progress"
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong!"
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/scanning/inbound/{order_id}/complete:
 *   post:
 *     tags:
 *       - Scanning
 *     summary: Complete inbound scanning and close order
 *     description: |
 *       Finalizes the inbound scanning process for an order.
 *       Verifies that all items have been scanned back into the warehouse.
 *       If successful, closes the order and releases all asset bookings.
 *       
 *       **Permissions Required**: Only ADMIN and LOGISTICS roles can complete scanning
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: order_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order ID
 *         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Inbound scanning completed and order closed
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
 *                   example: "Inbound scan completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     order_id:
 *                       type: string
 *                       description: Human-readable order ID
 *                       example: "ORD-20251227-001"
 *                     new_status:
 *                       type: string
 *                       description: New status of the order
 *                       example: "CLOSED"
 *             example:
 *               success: true
 *               message: "Inbound scan completed successfully"
 *               data:
 *                 order_id: "ORD-20251227-001"
 *                 new_status: "CLOSED"
 *       400:
 *         description: Bad request - Validation failed (e.g. items missing, wrong status)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *             examples:
 *               wrongStatus:
 *                 summary: Order not in AWAITING_RETURN status
 *                 value:
 *                   success: false
 *                   message: "Cannot complete inbound scan. Order status must be AWAITING_RETURN, current: IN_USE"
 *               missingItems:
 *                 summary: Not all items have been scanned
 *                 value:
 *                   success: false
 *                   message: "Cannot complete scan. Banquet Chair: 45/50 scanned"
 *       401:
 *         description: Unauthorized - Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "You are not authorized"
 *       403:
 *         description: Forbidden - Only warehouse staff can complete scanning
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Only warehouse staff can complete scanning"
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong!"
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/scanning/outbound/{order_id}/scan:
 *   post:
 *     tags:
 *       - Scanning
 *     summary: Scan item outbound (warehouse dispatch)
 *     description: |
 *       Records an outbound scan when items are being sent out from the warehouse to a client/event.
 *       This stateless endpoint writes directly to scan_events table and updates asset quantities.
 *       
 *       **Features:**
 *       - QR code-based asset identification
 *       - Support for both INDIVIDUAL and BATCH tracking
 *       - Automatic asset quantity updates
 *       - Real-time validation against order requirements
 *       - Over-scanning prevention
 *       
 *       **Permissions Required**: Only ADMIN and LOGISTICS roles can scan items
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: order_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order ID
 *         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - qr_code
 *             properties:
 *               qr_code:
 *                 type: string
 *                 minLength: 1
 *                 description: QR code of the asset being scanned
 *                 example: "ASSET-001-2025"
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Quantity to scan out (required for BATCH tracking assets)
 *                 example: 10
 *           examples:
 *             individualScan:
 *               summary: Individual item scan
 *               value:
 *                 qr_code: "ASSET-001-2025"
 *             batchScan:
 *               summary: Batch scan of multiple units
 *               value:
 *                 qr_code: "BATCH-CHAIRS-001"
 *                 quantity: 25
 *     responses:
 *       200:
 *         description: Item scanned out successfully
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
 *                   example: "Item scanned out successfully"
 *                 data:
 *                   type: object
 *                   description: Updated asset and scan information
 *                   properties:
 *                     scan_event_id:
 *                       type: string
 *                       format: uuid
 *                       description: ID of the created scan event
 *                       example: "d1e2f3a4-b5c6-7890-abcd-ef1234567890"
 *                     asset:
 *                       type: object
 *                       description: Updated asset information
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                         qr_code:
 *                           type: string
 *                         total_quantity:
 *                           type: integer
 *                         available_quantity:
 *                           type: integer
 *                         out_quantity:
 *                           type: integer
 *                         status:
 *                           type: string
 *                           enum: [AVAILABLE, BOOKED, OUT, MAINTENANCE]
 *                     scanned_quantity:
 *                       type: integer
 *                       description: Quantity scanned in this operation
 *                       example: 10
 *             example:
 *               success: true
 *               message: "Item scanned out successfully"
 *               data:
 *                 scan_event_id: "d1e2f3a4-b5c6-7890-abcd-ef1234567890"
 *                 asset:
 *                   id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                   name: "Banquet Chair - Gold"
 *                   qr_code: "BATCH-CHAIRS-001"
 *                   total_quantity: 100
 *                   available_quantity: 50
 *                   out_quantity: 50
 *                   status: "OUT"
 *                 scanned_quantity: 25
 *       400:
 *         description: Bad request - Validation errors or business rule violations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *             examples:
 *               missingQrCode:
 *                 summary: QR code not provided
 *                 value:
 *                   success: false
 *                   message: "QR code is required"
 *               assetNotInOrder:
 *                 summary: Asset not part of this order
 *                 value:
 *                   success: false
 *                   message: "Asset not in this order"
 *               quantityRequired:
 *                 summary: Quantity missing for batch asset
 *                 value:
 *                   success: false
 *                   message: "Quantity required for BATCH assets"
 *               overScanning:
 *                 summary: Attempting to scan more than required
 *                 value:
 *                   success: false
 *                   message: "Cannot scan 30 units. Order requires only 50, already scanned: 45"
 *               insufficientStock:
 *                 summary: Not enough available stock
 *                 value:
 *                   success: false
 *                   message: "Insufficient available quantity. Available: 10, Requested: 25"
 *               wrongOrderStatus:
 *                 summary: Order not in correct status for outbound scanning
 *                 value:
 *                   success: false
 *                   message: "Order must be in CONFIRMED status to scan items out"
 *       401:
 *         description: Unauthorized - Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "You are not authorized"
 *       403:
 *         description: Forbidden - Only warehouse staff can scan
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Only warehouse staff can scan items"
 *       404:
 *         description: Not Found - Order or asset not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *             examples:
 *               orderNotFound:
 *                 summary: Order not found
 *                 value:
 *                   success: false
 *                   message: "Order not found"
 *               assetNotFound:
 *                 summary: Asset not found by QR code
 *                 value:
 *                   success: false
 *                   message: "Asset not found with this QR code"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong!"
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/operations/v1/scanning/outbound/{order_id}/progress:
 *   get:
 *     tags:
 *       - Scanning
 *     summary: Get outbound scanning progress for an order
 *     description: |
 *       Retrieves detailed scanning progress for a specific order being prepared for dispatch.
 *       Shows how many items have been scanned out from the warehouse versus the total required.
 *       
 *       **Features:**
 *       - Overall progress percentage
 *       - Per-asset breakdown of scanned vs required quantities
 *       - Completion status for each asset
 *       - Asset tracking method visibility
 *       
 *       **Permissions Required**: Only ADMIN and LOGISTICS roles can view progress
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - in: path
 *         name: order_id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Order ID
 *         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Progress retrieved successfully
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
 *                   example: "Outbound scan progress retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     order_id:
 *                       type: string
 *                       description: Human-readable order ID
 *                       example: "ORD-20251227-001"
 *                     order_status:
 *                       type: string
 *                       description: Current order status
 *                       example: "IN_PREPARATION"
 *                     total_items:
 *                       type: integer
 *                       description: Total items in the order
 *                       example: 100
 *                     items_scanned:
 *                       type: integer
 *                       description: Total items scanned for dispatch
 *                       example: 75
 *                     percent_complete:
 *                       type: integer
 *                       description: Percentage of items scanned
 *                       example: 75
 *                     assets:
 *                       type: array
 *                       description: Per-asset scanning progress
 *                       items:
 *                         type: object
 *                         properties:
 *                           asset_id:
 *                             type: string
 *                             format: uuid
 *                           asset_name:
 *                             type: string
 *                             example: "Banquet Chair - Gold"
 *                           qr_code:
 *                             type: string
 *                             example: "ASSET-CHAIR-001"
 *                           tracking_method:
 *                             type: string
 *                             enum: [INDIVIDUAL, BATCH]
 *                             example: "BATCH"
 *                           required_quantity:
 *                             type: integer
 *                             description: Quantity needed for this order
 *                             example: 50
 *                           scanned_quantity:
 *                             type: integer
 *                             description: Quantity scanned for dispatch
 *                             example: 45
 *                           is_complete:
 *                             type: boolean
 *                             description: Whether all units have been scanned
 *                             example: false
 *             example:
 *               success: true
 *               message: "Outbound scan progress retrieved successfully"
 *               data:
 *                 order_id: "ORD-20251227-001"
 *                 order_status: "IN_PREPARATION"
 *                 total_items: 100
 *                 items_scanned: 75
 *                 percent_complete: 75
 *                 assets:
 *                   - asset_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     asset_name: "Banquet Chair - Gold"
 *                     qr_code: "ASSET-CHAIR-001"
 *                     tracking_method: "BATCH"
 *                     required_quantity: 50
 *                     scanned_quantity: 45
 *                     is_complete: false
 *                   - asset_id: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                     asset_name: "Display Stand - Premium"
 *                     qr_code: "ASSET-STAND-001"
 *                     tracking_method: "INDIVIDUAL"
 *                     required_quantity: 25
 *                     scanned_quantity: 25
 *                     is_complete: true
 *       401:
 *         description: Unauthorized - Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "You are not authorized"
 *       403:
 *         description: Forbidden - Only warehouse staff can view progress
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Only warehouse staff can view scan progress"
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Something went wrong!"
 *     security:
 *       - BearerAuth: []
 */
