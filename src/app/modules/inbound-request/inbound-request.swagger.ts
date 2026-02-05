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
 *   get:
 *     tags:
 *       - Inbound Request
 *     summary: Get all inbound requests
 *     description: Retrieves a paginated list of inbound requests. Supports filtering, sorting, and search.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: page
 *         in: query
 *         description: Page number
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *       - name: limit
 *         in: query
 *         description: Items per page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *       - name: search_term
 *         in: query
 *         description: Search by note or company name
 *         required: false
 *         schema:
 *           type: string
 *       - name: company_id
 *         in: query
 *         description: Filter by company ID
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: request_status
 *         in: query
 *         description: Filter by request status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [PRICING_REVIEW, PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED]
 *       - name: financial_status
 *         in: query
 *         description: Filter by financial status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [PENDING_QUOTE, QUOTE_GENERATED, QUOTE_REVISED, PENDING_PAYMENT, PAID, PARTIALLY_PAID, REFUNDED, VOID, CREDIT_NOTE_ISSUED]
 *       - name: date_from
 *         in: query
 *         description: Filter by creation date from
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: date_to
 *         in: query
 *         description: Filter by creation date to
 *         required: false
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: sort_by
 *         in: query
 *         description: Field to sort by
 *         required: false
 *         schema:
 *           type: string
 *           enum: [incoming_at, created_at, request_status, financial_status]
 *       - name: sort_order
 *         in: query
 *         description: Sort order
 *         required: false
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Inbound requests fetched successfully
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
 *                   example: "Inbound requests fetched successfully"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     total_pages:
 *                       type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       platform_id:
 *                         type: string
 *                         format: uuid
 *                       incoming_at:
 *                         type: string
 *                         format: date-time
 *                       note:
 *                         type: string
 *                         nullable: true
 *                       request_status:
 *                         type: string
 *                         enum: [PRICING_REVIEW, PENDING_APPROVAL, APPROVED, REJECTED, CANCELLED]
 *                       financial_status:
 *                         type: string
 *                         enum: [PENDING_QUOTE, QUOTE_GENERATED, QUOTE_REVISED, PENDING_PAYMENT, PAID, PARTIALLY_PAID, REFUNDED, VOID, CREDIT_NOTE_ISSUED]
 *                       company:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                       requester:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                             format: email
 *                       request_pricing:
 *                         type: object
 *                         nullable: true
 *                         description: Full pricing details for ADMIN/LOGISTICS, only final_total for CLIENT
 *                         properties:
 *                           warehouse_ops_rate:
 *                             type: string
 *                             description: Only visible to ADMIN/LOGISTICS roles
 *                           base_ops_total:
 *                             type: string
 *                             description: Only visible to ADMIN/LOGISTICS roles
 *                           logistics_sub_total:
 *                             type: string
 *                             description: Only visible to ADMIN/LOGISTICS roles
 *                           final_total:
 *                             type: string
 *                           line_items:
 *                             type: object
 *                             description: Only visible to ADMIN/LOGISTICS roles
 *                             properties:
 *                               catalog_total:
 *                                 type: number
 *                               custom_total:
 *                                 type: number
 *                           margin:
 *                             type: object
 *                             description: Only visible to ADMIN/LOGISTICS roles
 *                             properties:
 *                               percent:
 *                                 type: string
 *                               amount:
 *                                 type: number
 *                               is_override:
 *                                 type: boolean
 *                               override_reason:
 *                                 type: string
 *                                 nullable: true
 *                           calculated_by:
 *                             type: string
 *                             format: uuid
 *                             description: Only visible to ADMIN/LOGISTICS roles
 *                           calculated_at:
 *                             type: string
 *                             format: date-time
 *                             description: Only visible to ADMIN/LOGISTICS roles
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
