/**
 * @swagger
 * /api/clients/v1/order:
 *   get:
 *     tags:
 *       - Order Management
 *     summary: Get orders
 *     description: |
 *       Retrieves a list of orders with filtering and pagination options.
 *       - CLIENT users can only see their company's orders
 *       - ADMIN and LOGISTICS users can see all orders
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: page
 *         in: query
 *         description: Page number for pagination
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         description: Number of items per page
 *         schema:
 *           type: integer
 *           default: 10
 *       - name: search_term
 *         in: query
 *         description: Search by order ID, contact name, or venue name
 *         schema:
 *           type: string
 *       - name: company_id
 *         in: query
 *         description: Filter by company ID
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: brand_id
 *         in: query
 *         description: Filter by brand ID
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: order_status
 *         in: query
 *         description: Filter by order status
 *         schema:
 *           type: string
 *           enum: [DRAFT, SUBMITTED, PRICING_REVIEW, PENDING_APPROVAL, QUOTED, DECLINED, CONFIRMED, IN_PREPARATION, READY_FOR_DELIVERY, IN_TRANSIT, DELIVERED, IN_USE, AWAITING_RETURN, CLOSED]
 *       - name: financial_status
 *         in: query
 *         description: Filter by financial status
 *         schema:
 *           type: string
 *           enum: [PENDING_QUOTE, QUOTE_SENT, QUOTE_ACCEPTED, PENDING_INVOICE, INVOICED, PAID]
 *       - name: date_from
 *         in: query
 *         description: Filter orders created from this date (ISO 8601)
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: date_to
 *         in: query
 *         description: Filter orders created until this date (ISO 8601)
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: sort_by
 *         in: query
 *         description: Field to sort by
 *         schema:
 *           type: string
 *           enum: [order_id, order_status, financial_status, event_start_date, created_at, updated_at]
 *           default: created_at
 *       - name: sort_order
 *         in: query
 *         description: Sort order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *     responses:
 *       200:
 *         description: Orders fetched successfully
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
 *                   example: "Orders fetched successfully"
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       example: 10
 *                     total:
 *                       type: integer
 *                       example: 50
 *                     total_pages:
 *                       type: integer
 *                       example: 5
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       order_id:
 *                         type: string
 *                         example: "ORD-20251227-001"
 *                       company:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                       brand:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                       user_id:
 *                         type: string
 *                         format: uuid
 *                       job_number:
 *                         type: string
 *                         nullable: true
 *                       contact_name:
 *                         type: string
 *                       contact_email:
 *                         type: string
 *                       contact_phone:
 *                         type: string
 *                       event_start_date:
 *                         type: string
 *                         format: date-time
 *                       event_end_date:
 *                         type: string
 *                         format: date-time
 *                       venue_name:
 *                         type: string
 *                       venue_location:
 *                         type: object
 *                         properties:
 *                           country:
 *                             type: string
 *                           city:
 *                             type: string
 *                           address:
 *                             type: string
 *                           access_notes:
 *                             type: string
 *                             nullable: true
 *                       calculated_totals:
 *                         type: object
 *                         properties:
 *                           volume:
 *                             type: string
 *                           weight:
 *                             type: string
 *                       order_status:
 *                         type: string
 *                       financial_status:
 *                         type: string
 *                       tier_id:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                       item_count:
 *                         type: integer
 *                         description: Total number of items in the order
 *                       item_preview:
 *                         type: array
 *                         description: Preview of first 3 asset names
 *                         items:
 *                           type: string
 *       401:
 *         description: Unauthorized - Authentication required
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/clients/v1/order/submit-from-cart:
 *   post:
 *     tags:
 *       - Order Management
 *     summary: Submit a new order
 *     description: |
 *       Submits a new order from cart items. This endpoint performs comprehensive validation including:
 *       - Asset availability checking for the requested dates
 *       - Asset ownership verification
 *       - Date validation (no past dates, end >= start)
 *       - Venue and contact information validation
 *       - Automatic pricing tier matching based on location and volume
 *       - Asset booking creation to reserve items for the event period
 *       
 *       The order is created with status 'PRICING_REVIEW' and financial status 'PENDING_QUOTE'.
 *       Email notifications are sent to PMG admins, A2 staff, and the client.
 *       
 *       **Permissions Required**: `orders:create`
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - items
 *               - eventStartDate
 *               - eventEndDate
 *               - venueName
 *               - venueCountry
 *               - venueCity
 *               - venueAddress
 *               - contactName
 *               - contactEmail
 *               - contactPhone
 *             properties:
 *               items:
 *                 type: array
 *                 minItems: 1
 *                 description: Array of order items (at least one required)
 *                 items:
 *                   type: object
 *                   required:
 *                     - assetId
 *                     - quantity
 *                   properties:
 *                     assetId:
 *                       type: string
 *                       format: uuid
 *                       description: Asset unique identifier
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *                       description: Quantity of this asset to order
 *                       example: 5
 *                     fromCollectionId:
 *                       type: string
 *                       format: uuid
 *                       description: Optional collection ID if item is from a collection
 *                       example: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *               brand:
 *                 type: string
 *                 maxLength: 100
 *                 description: Optional brand name for the order
 *                 example: "Nike"
 *               eventStartDate:
 *                 type: string
 *                 format: date
 *                 description: Event start date (cannot be in the past)
 *                 example: "2025-01-15"
 *               eventEndDate:
 *                 type: string
 *                 format: date
 *                 description: Event end date (must be on or after start date)
 *                 example: "2025-01-20"
 *               venueName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 200
 *                 description: Venue name
 *                 example: "Dubai World Trade Centre"
 *               venueCountry:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: Venue country (used for pricing tier matching)
 *                 example: "UAE"
 *               venueCity:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: Venue city (used for pricing tier matching)
 *                 example: "Dubai"
 *               venueAddress:
 *                 type: string
 *                 minLength: 1
 *                 description: Complete venue address
 *                 example: "Sheikh Zayed Road, Trade Centre 1, Dubai"
 *               venueAccessNotes:
 *                 type: string
 *                 description: Optional access notes for the venue
 *                 example: "Loading dock access from rear entrance, Gate 3"
 *               contactName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Contact person name
 *                 example: "John Doe"
 *               contactEmail:
 *                 type: string
 *                 format: email
 *                 maxLength: 255
 *                 description: Contact person email
 *                 example: "john.doe@example.com"
 *               contactPhone:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: Contact person phone number
 *                 example: "+971501234567"
 *               specialInstructions:
 *                 type: string
 *                 description: Optional special instructions for the order
 *                 example: "Please deliver items 2 days before event start"
 *           examples:
 *             singleItem:
 *               summary: Order with single item
 *               value:
 *                 items:
 *                   - assetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     quantity: 10
 *                 eventStartDate: "2025-01-15"
 *                 eventEndDate: "2025-01-20"
 *                 venueName: "Dubai World Trade Centre"
 *                 venueCountry: "UAE"
 *                 venueCity: "Dubai"
 *                 venueAddress: "Sheikh Zayed Road, Trade Centre 1, Dubai"
 *                 contactName: "John Doe"
 *                 contactEmail: "john.doe@example.com"
 *                 contactPhone: "+971501234567"
 *             multipleItems:
 *               summary: Order with multiple items and collection
 *               value:
 *                 items:
 *                   - assetId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     quantity: 10
 *                   - assetId: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                     quantity: 5
 *                     fromCollectionId: "c1d2e3f4-a5b6-7890-cdef-123456789abc"
 *                 brand: "Nike"
 *                 eventStartDate: "2025-02-10"
 *                 eventEndDate: "2025-02-15"
 *                 venueName: "Abu Dhabi Convention Centre"
 *                 venueCountry: "UAE"
 *                 venueCity: "Abu Dhabi"
 *                 venueAddress: "Khaleej Al Arabi Street, Abu Dhabi"
 *                 venueAccessNotes: "Loading dock access from rear entrance"
 *                 contactName: "Jane Smith"
 *                 contactEmail: "jane.smith@example.com"
 *                 contactPhone: "+971509876543"
 *                 specialInstructions: "Please deliver 48 hours before event"
 *     responses:
 *       201:
 *         description: Order submitted successfully
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
 *                   example: "Order submitted successfully. You will receive a quote via email within 24-48 hours."
 *                 data:
 *                   type: object
 *                   properties:
 *                     order_id:
 *                       type: string
 *                       description: Human-readable order ID in format ORD-YYYYMMDD-XXX
 *                       example: "ORD-20251226-001"
 *                     status:
 *                       type: string
 *                       description: Order status (always PRICING_REVIEW for new orders)
 *                       example: "PRICING_REVIEW"
 *                     company_name:
 *                       type: string
 *                       description: Name of the company that placed the order
 *                       example: "Diageo Events"
 *                     calculated_volume:
 *                       type: string
 *                       description: Total calculated volume in cubic meters (m³)
 *                       example: "12.500"
 *                     item_count:
 *                       type: integer
 *                       description: Total number of items in the order
 *                       example: 3
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
 *               emptyItems:
 *                 summary: Empty items array
 *                 value:
 *                   success: false
 *                   message: "At least one item is required"
 *               pastDate:
 *                 summary: Event date in the past
 *                 value:
 *                   success: false
 *                   message: "Event start date cannot be in the past"
 *               invalidDateRange:
 *                 summary: Invalid date range
 *                 value:
 *                   success: false
 *                   message: "Event end date must be on or after start date"
 *               unavailableAssets:
 *                 summary: Assets not available
 *                 value:
 *                   success: false
 *                   message: "Cannot order unavailable assets: Display Stand, Promotional Banner"
 *               insufficientAvailability:
 *                 summary: Insufficient quantity available
 *                 value:
 *                   success: false
 *                   message: "Insufficient availability for requested dates: Display Stand: requested 10, available 5 (available from 2025-01-25)"
 *               invalidEmail:
 *                 summary: Invalid email format
 *                 value:
 *                   success: false
 *                   message: "Invalid email format"
 *               missingCompany:
 *                 summary: Company ID required
 *                 value:
 *                   success: false
 *                   message: "Company ID is required"
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
 *         description: Forbidden - Insufficient permissions
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
 *                   example: "You do not have permission to submit orders"
 *       404:
 *         description: Not Found - Assets not found or don't belong to company
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
 *                   example: "One or more assets not found or do not belong to your company"
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
