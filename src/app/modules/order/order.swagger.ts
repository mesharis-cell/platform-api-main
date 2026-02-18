/**
 * @swagger
 * /api/client/v1/order:
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
 *                       created_by:
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
 * /api/client/v1/order/my:
 *   get:
 *     tags:
 *       - Order Management
 *     summary: Get my orders (CLIENT only)
 *     description: |
 *       Retrieves orders created by the authenticated CLIENT user.
 *       This endpoint is specifically for CLIENT users to view their own submitted orders.
 *       Returns orders with basic information without item details.
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
 *         description: Search by order ID, contact name, venue name, or asset name
 *         schema:
 *           type: string
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
 *         description: My orders fetched successfully
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
 *                       example: 25
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
 *                       created_by:
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
 *                       special_instructions:
 *                         type: string
 *                         nullable: true
 *                       calculated_totals:
 *                         type: object
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
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Only CLIENT users can access this endpoint
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/export:
 *   get:
 *     tags:
 *       - Order Management
 *     summary: Export orders to CSV (ADMIN/LOGISTICS only)
 *     description: |
 *       Exports orders to a CSV file with all order details.
 *       This endpoint uses the same filtering options as the GET orders endpoint.
 *       Maximum 10,000 records can be exported at once.
 *       Only ADMIN and LOGISTICS users can export orders.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: search_term
 *         in: query
 *         description: Search by order ID, contact name, venue name, or asset name
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
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             description: Attachment filename
 *             schema:
 *               type: string
 *               example: 'attachment; filename="orders-export-2025-12-27T11-48-00.csv"'
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Only ADMIN and LOGISTICS users can export
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/pricing-review:
 *   get:
 *     tags:
 *       - Order Management
 *     summary: Get orders pending pricing review (ADMIN only)
 *     description: |
 *       Retrieves a list of orders that are in the PRICING_REVIEW status.
 *       Includes suggested pricing information based on volume and location matching with pricing tiers.
 *
 *       **Access Control:**
 *       - ADMIN users only
 *
 *       **Search Functionality:**
 *       - Searches across order ID, contact name, venue name, and asset names
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: page
 *         in: query
 *         description: Page number
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
 *         description: Search by Order ID, contact name, venue name, or asset name
 *         schema:
 *           type: string
 *       - name: company_id
 *         in: query
 *         description: Filter by Company ID
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: date_from
 *         in: query
 *         description: Filter orders created from this date
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: date_to
 *         in: query
 *         description: Filter orders created until this date
 *         schema:
 *           type: string
 *           format: date-time
 *       - name: sort_by
 *         in: query
 *         description: Sort field
 *         schema:
 *           type: string
 *           enum: [created_at, updated_at, event_start_date, event_end_date, order_status, financial_status]
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
 *         description: Pricing review orders fetched successfully
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
 *                   example: "Pricing review orders fetched successfully"
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
 *                       example: 25
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                         description: Order internal UUID
 *                         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                       order_id:
 *                         type: string
 *                         description: Human-readable order ID
 *                         example: "ORD-20251227-001"
 *                       company:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                             example: "Diageo"
 *                       contact_name:
 *                         type: string
 *                         example: "John Doe"
 *                       event_start_date:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-01-15T00:00:00Z"
 *                       venue_name:
 *                         type: string
 *                         example: "Dubai World Trade Centre"
 *                       venue_location:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           country:
 *                             type: string
 *                             example: "UAE"
 *                           city:
 *                             type: string
 *                             example: "Dubai"
 *                           address:
 *                             type: string
 *                             example: "Sheikh Zayed Road, Trade Centre 1"
 *                           access_notes:
 *                             type: string
 *                             nullable: true
 *                       calculated_volume:
 *                         type: string
 *                         nullable: true
 *                         description: Total calculated volume in cubic meters (m³)
 *                         example: "12.500"
 *                       calculated_weight:
 *                         type: string
 *                         nullable: true
 *                         description: Total calculated weight in kilograms (kg)
 *                         example: "450.250"
 *                       status:
 *                         type: string
 *                         description: Order status (always PRICING_REVIEW for this endpoint)
 *                         example: "PRICING_REVIEW"
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         description: Order creation timestamp
 *                         example: "2025-12-27T10:30:00Z"
 *                       standard_pricing:
 *                         type: object
 *                         nullable: true
 *                         description: Suggested pricing based on matching tier (null if no tier found)
 *                         properties:
 *                           basePrice:
 *                             type: number
 *                             format: float
 *                             example: 5000.00
 *                             description: Flat rate from pricing tier (NOT per-m³ multiplication)
 *                           tierInfo:
 *                             type: object
 *                             properties:
 *                               country:
 *                                 type: string
 *                                 example: "UAE"
 *                               city:
 *                                 type: string
 *                                 example: "Dubai"
 *                               volume_range:
 *                                 type: string
 *                                 example: "0-10 m³"
 *                                 description: Volume range that this tier applies to
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Insufficient permissions (ADMIN only)
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/{id}:
 *   get:
 *     tags:
 *       - Order Management
 *     summary: Get order by ID
 *     description: |
 *       Retrieves detailed information about a specific order including:
 *       - Complete order details (contact, venue, event dates, etc.)
 *       - Order items with asset and collection information
 *       - Company, brand, and user information
 *       - Pricing and delivery window details
 *
 *       **Access Control:**
 *       - CLIENT users can only access their own company's orders
 *       - ADMIN and LOGISTICS users can access all orders
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *       - name: quote
 *         in: query
 *         description: Get quoted order
 *         schema:
 *           type: string
 *           enum: [true, false]
 *     responses:
 *       200:
 *         description: Order fetched successfully
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
 *                   example: "Order fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     platform_id:
 *                       type: string
 *                       format: uuid
 *                     order_id:
 *                       type: string
 *                       example: "ORD-20251227-001"
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                     brand_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     user_id:
 *                       type: string
 *                       format: uuid
 *                     job_number:
 *                       type: string
 *                       nullable: true
 *                     contact_name:
 *                       type: string
 *                     contact_email:
 *                       type: string
 *                     contact_phone:
 *                       type: string
 *                     event_start_date:
 *                       type: string
 *                       format: date-time
 *                     event_end_date:
 *                       type: string
 *                       format: date-time
 *                     venue_name:
 *                       type: string
 *                     venue_location:
 *                       type: object
 *                       properties:
 *                         country:
 *                           type: string
 *                         city:
 *                           type: string
 *                         address:
 *                           type: string
 *                         access_notes:
 *                           type: string
 *                           nullable: true
 *                     special_instructions:
 *                       type: string
 *                       nullable: true
 *                     delivery_window:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: date-time
 *                         end:
 *                           type: string
 *                           format: date-time
 *                     pickup_window:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: date-time
 *                         end:
 *                           type: string
 *                           format: date-time
 *                     calculated_totals:
 *                       type: object
 *                       properties:
 *                         volume:
 *                           type: string
 *                         weight:
 *                           type: string
 *                     tier_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     logistics_pricing:
 *                       type: object
 *                       nullable: true
 *                     platform_pricing:
 *                       type: object
 *                       nullable: true
 *                     final_pricing:
 *                       type: object
 *                       nullable: true
 *                     payment_method:
 *                       type: string
 *                       nullable: true
 *                     payment_reference:
 *                       type: string
 *                       nullable: true
 *                     order_status:
 *                       type: string
 *                       example: "PRICING_REVIEW"
 *                     financial_status:
 *                       type: string
 *                       example: "PENDING_QUOTE"
 *                     scanning_data:
 *                       type: object
 *                     delivery_photos:
 *                       type: array
 *                       items:
 *                         type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                     deleted_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     company:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                     brand:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           order_item:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               platform_id:
 *                                 type: string
 *                                 format: uuid
 *                               order_id:
 *                                 type: string
 *                                 format: uuid
 *                               asset_id:
 *                                 type: string
 *                                 format: uuid
 *                               asset_name:
 *                                 type: string
 *                               quantity:
 *                                 type: integer
 *                               volume_per_unit:
 *                                 type: string
 *                               weight_per_unit:
 *                                 type: string
 *                               total_volume:
 *                                 type: string
 *                               total_weight:
 *                                 type: string
 *                               from_collection:
 *                                 type: string
 *                                 format: uuid
 *                                 nullable: true
 *                               from_collection_name:
 *                                 type: string
 *                                 nullable: true
 *                               created_at:
 *                                 type: string
 *                                 format: date-time
 *                           asset:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                               condition:
 *                                 type: string
 *                           collection:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                     order_status_history:
 *                       type: array
 *                       description: History of order status changes, ordered by most recent first
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           platform_id:
 *                             type: string
 *                             format: uuid
 *                           order_id:
 *                             type: string
 *                             format: uuid
 *                           status:
 *                             type: string
 *                             enum: [DRAFT, SUBMITTED, PRICING_REVIEW, PENDING_APPROVAL, QUOTED, DECLINED, CONFIRMED, IN_PREPARATION, READY_FOR_DELIVERY, IN_TRANSIT, DELIVERED, IN_USE, AWAITING_RETURN, CLOSED]
 *                             example: "CONFIRMED"
 *                           notes:
 *                             type: string
 *                             nullable: true
 *                           updated_by:
 *                             type: string
 *                             format: uuid
 *                             description: User ID who made the status change
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                             description: When the status change occurred
 *                     financial_status_history:
 *                       type: array
 *                       description: History of financial status changes, ordered by most recent first
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           platform_id:
 *                             type: string
 *                             format: uuid
 *                           order_id:
 *                             type: string
 *                             format: uuid
 *                           status:
 *                             type: string
 *                             enum: [PENDING_QUOTE, QUOTE_SENT, QUOTE_ACCEPTED, PENDING_INVOICE, INVOICED, PAID]
 *                             example: "QUOTE_SENT"
 *                           notes:
 *                             type: string
 *                             nullable: true
 *                           updated_by:
 *                             type: string
 *                             format: uuid
 *                             description: User ID who made the status change
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                             description: When the status change occurred
 *                     invoice:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         invoice_id:
 *                           type: string
 *                           example: INV-20260103-001
 *                         invoice_pdf_url:
 *                           type: string
 *                           example: https://example.com/invoice.pdf
 *                         invoice_paid_at:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                         payment_method:
 *                           type: string
 *                         payment_reference:
 *                           type: string
 *                         created_at:
 *                           type: string
 *                           format: date-time
 *                         updated_at:
 *                           type: string
 *                           format: date-time
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - You don't have access to this order
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/{id}/pricing-details:
 *   get:
 *     tags:
 *       - Order Management
 *     summary: Get order pricing details (ADMIN/LOGISTICS only)
 *     description: |
 *       Retrieves comprehensive pricing information for a specific order including:
 *       - Order basic information (ID, volume, location, company)
 *       - Matched pricing tier details
 *       - Standard pricing calculation based on tier
 *       - Current pricing details (logistics pricing, platform margin, final price)
 *
 *       **Access Control:**
 *       - ADMIN and LOGISTICS users can access all orders
 *       - CLIENT users will receive a 403 Forbidden error
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Order pricing details fetched successfully
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
 *                   example: "Order pricing details fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     order:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         order_id:
 *                           type: string
 *                           example: "ORD-20251227-001"
 *                         calculated_volume:
 *                           type: string
 *                           nullable: true
 *                           example: "12.500"
 *                           description: Total calculated volume in cubic meters (m³)
 *                         venue_location:
 *                           type: object
 *                           description: Venue location details (JSONB)
 *                           properties:
 *                             country:
 *                               type: string
 *                               example: "UAE"
 *                             city:
 *                               type: string
 *                               example: "Dubai"
 *                             address:
 *                               type: string
 *                               example: "123 Main St"
 *                             access_notes:
 *                               type: string
 *                               nullable: true
 *                         company:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                               format: uuid
 *                             name:
 *                               type: string
 *                               example: "Diageo"
 *                             platform_margin_percent:
 *                               type: string
 *                               example: "25.00"
 *                               description: Platform margin percentage for this company
 *                     pricing_tier:
 *                       type: object
 *                       nullable: true
 *                       description: Matched pricing tier for this order (null if no tier matched)
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         country:
 *                           type: string
 *                           example: "UAE"
 *                         city:
 *                           type: string
 *                           example: "Dubai"
 *                         volume_min:
 *                           type: string
 *                           example: "0.000"
 *                           description: Minimum volume for this tier (m³)
 *                         volume_max:
 *                           type: string
 *                           nullable: true
 *                           example: "10.000"
 *                           description: Maximum volume for this tier (m³), null means unlimited
 *                         base_price:
 *                           type: string
 *                           example: "5000.00"
 *                           description: Base price for this tier
 *                     standard_pricing:
 *                       type: object
 *                       nullable: true
 *                       description: Calculated standard pricing based on matched tier
 *                       properties:
 *                         pricing_tier_id:
 *                           type: string
 *                           format: uuid
 *                           nullable: true
 *                           description: ID of the matched pricing tier
 *                         logistics_base_price:
 *                           type: number
 *                           nullable: true
 *                           example: 5000.00
 *                           description: Base price from pricing tier (logistics base price)
 *                         platform_margin_percent:
 *                           type: number
 *                           nullable: true
 *                           example: 25.00
 *                           description: Platform margin percentage
 *                         platform_margin_amount:
 *                           type: number
 *                           nullable: true
 *                           example: 1250.00
 *                           description: Calculated platform margin amount
 *                         final_total_price:
 *                           type: number
 *                           nullable: true
 *                           example: 6250.00
 *                           description: Final total price (base price + platform margin)
 *                         tier_found:
 *                           type: boolean
 *                           example: true
 *                           description: Whether a matching pricing tier was found
 *                     current_pricing:
 *                       type: object
 *                       description: Current pricing details (JSONB objects from database)
 *                       properties:
 *                         logistics_pricing:
 *                           type: object
 *                           nullable: true
 *                           description: Logistics pricing details (JSONB)
 *                           properties:
 *                             base_price:
 *                               type: number
 *                               example: 5000.00
 *                             adjusted_price:
 *                               type: number
 *                               example: 4500.00
 *                             adjustment_reason:
 *                               type: string
 *                               example: "Volume discount applied"
 *                             adjusted_at:
 *                               type: string
 *                               format: date-time
 *                             adjusted_by:
 *                               type: string
 *                               format: uuid
 *                               description: User ID who adjusted pricing
 *                         platform_pricing:
 *                           type: object
 *                           nullable: true
 *                           description: Platform pricing details (JSONB)
 *                           properties:
 *                             margin_percent:
 *                               type: number
 *                               example: 25.00
 *                             margin_amount:
 *                               type: number
 *                               example: 1125.00
 *                             reviewed_at:
 *                               type: string
 *                               format: date-time
 *                             reviewed_by:
 *                               type: string
 *                               format: uuid
 *                               description: User ID who reviewed pricing
 *                             notes:
 *                               type: string
 *                               example: "Approved"
 *                         final_pricing:
 *                           type: object
 *                           nullable: true
 *                           description: Final pricing details (JSONB)
 *                           properties:
 *                             total_price:
 *                               type: number
 *                               example: 5625.00
 *                             quote_sent_at:
 *                               type: string
 *                               format: date-time
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Only ADMIN and LOGISTICS users can access this endpoint
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/{id}/adjust-pricing:
 *   patch:
 *     tags:
 *       - Order Management
 *     summary: Adjust logistics pricing (ADMIN/LOGISTICS only)
 *     description: |
 *       Adjusts the logistics pricing for an order in PRICING_REVIEW status.
 *       Updates the logistics_pricing JSONB field and transitions the order to QUOTED status.
 *
 *       **Access Control:**
 *       - ADMIN and LOGISTICS users can adjust pricing
 *       - CLIENT users will receive a 403 Forbidden error
 *
 *       **Requirements:**
 *       - Order must be in PRICING_REVIEW status
 *       - Adjusted price must be greater than 0
 *       - Adjustment reason must be at least 10 characters
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - adjusted_price
 *               - adjustment_reason
 *             properties:
 *               adjusted_price:
 *                 type: number
 *                 description: Adjusted logistics price (must be greater than 0)
 *                 example: 4500.00
 *               adjustment_reason:
 *                 type: string
 *                 description: Reason for price adjustment (minimum 10 characters)
 *                 example: "Volume discount applied for large order"
 *     responses:
 *       200:
 *         description: Logistics pricing adjusted successfully
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
 *                   example: "Logistics pricing adjusted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     order_id:
 *                       type: string
 *                       example: "ORD-20251227-001"
 *                     order_status:
 *                       type: string
 *                       example: "QUOTED"
 *                     company:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         name:
 *                           type: string
 *                           example: "Diageo"
 *       400:
 *         description: Bad request - Invalid input or order not in PRICING_REVIEW status
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
 *                   example: "Order is not in PRICING_REVIEW status"
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Only ADMIN and LOGISTICS users can adjust pricing
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/{id}/status:
 *   patch:
 *     tags:
 *       - Order Management
 *     summary: Progress order status (ADMIN/LOGISTICS only)
 *     description: |
 *       Updates the status of a specific order.
 *       This endpoint is restricted to ADMIN and LOGISTICS users only.
 *
 *       **Access Control:**
 *       - ADMIN and LOGISTICS users can update order status
 *       - CLIENT users will receive a 403 Forbidden error
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - new_status
 *             properties:
 *               new_status:
 *                 type: string
 *                 enum: [DRAFT, SUBMITTED, PRICING_REVIEW, PENDING_APPROVAL, QUOTED, DECLINED, CONFIRMED, IN_PREPARATION, READY_FOR_DELIVERY, IN_TRANSIT, DELIVERED, IN_USE, AWAITING_RETURN, CLOSED]
 *                 description: The new status to transition to
 *                 example: "CONFIRMED"
 *               notes:
 *                 type: string
 *                 description: Optional notes for the status change
 *                 example: "Order validated and confirmed."
 *     responses:
 *       200:
 *         description: Order status updated successfully
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
 *                   example: "Order status updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     order_id:
 *                       type: string
 *                       example: "ORD-20251227-001"
 *                     order_status:
 *                       type: string
 *                       example: "CONFIRMED"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid status transition or bad request
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/{id}/status-history:
 *   get:
 *     tags:
 *       - Order Management
 *     summary: Get order status history
 *     description: |
 *       Retrieves the status history of a specific order.
 *
 *       **Access Control:**
 *       - ADMIN and LOGISTICS users can view history for all orders
 *       - CLIENT users can only view history for their company's orders
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Status history fetched successfully
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
 *                   example: "Order status history fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     order_id:
 *                       type: string
 *                       example: "ORD-20251227-001"
 *                     current_status:
 *                       type: string
 *                       example: "CONFIRMED"
 *                     history:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           status:
 *                             type: string
 *                             example: "CONFIRMED"
 *                           notes:
 *                             type: string
 *                             nullable: true
 *                             example: "Order validated and confirmed."
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           updated_by_user:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                               email:
 *                                 type: string
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Insufficient permissions or no access to order
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/{id}/time-windows:
 *   patch:
 *     tags:
 *       - Order Management
 *     summary: Update order time windows (ADMIN/LOGISTICS only)
 *     description: |
 *       Updates the delivery and pickup time windows for a specific order.
 *       Cannot update time windows if order is IN_TRANSIT, DELIVERED, IN_USE, AWAITING_RETURN, or CLOSED.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - delivery_window_start
 *               - delivery_window_end
 *               - pickup_window_start
 *               - pickup_window_end
 *             properties:
 *               delivery_window_start:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-01-15T09:00:00Z"
 *               delivery_window_end:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-01-15T11:00:00Z"
 *               pickup_window_start:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-01-16T14:00:00Z"
 *               pickup_window_end:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-01-16T16:00:00Z"
 *     responses:
 *       200:
 *         description: Time windows updated successfully
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
 *                   example: "Time windows updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     order_id:
 *                       type: string
 *                     delivery_window:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: date-time
 *                         end:
 *                           type: string
 *                           format: date-time
 *                     pickup_window:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: date-time
 *                         end:
 *                           type: string
 *                           format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid dates or bad request
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/{id}/job-number:
 *   patch:
 *     tags:
 *       - Order Management
 *     summary: Update order job number (ADMIN/LOGISTICS only)
 *     description: |
 *       Updates the job number for a specific order.
 *       This endpoint is restricted to ADMIN and LOGISTICS users only.
 *
 *       **Validation Rules:**
 *       - Job number is required (cannot be null or empty)
 *       - Must be alphanumeric (letters, numbers, hyphens, underscores only)
 *       - Maximum 100 characters
 *
 *       **Access Control:**
 *       - ADMIN and LOGISTICS users can update job numbers
 *       - CLIENT users will receive a 403 Forbidden error
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - job_number
 *             properties:
 *               job_number:
 *                 type: string
 *                 maxLength: 100
 *                 pattern: '^[a-zA-Z0-9\-_]+$'
 *                 description: Job number (alphanumeric, hyphens, underscores only)
 *                 example: "JOB-2025-001"
 *           examples:
 *             updateJobNumber:
 *               summary: Update job number
 *               value:
 *                 job_number: "JOB-2025-001"
 *     responses:
 *       200:
 *         description: Job number updated successfully
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
 *                   example: "Job number updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     order_id:
 *                       type: string
 *                       example: "ORD-20251227-001"
 *                     job_number:
 *                       type: string
 *                       example: "JOB-2025-001"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad Request - Invalid job number format
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
 *                   examples:
 *                     - "Job number must be alphanumeric (letters, numbers, hyphens, underscores only)"
 *                     - "Job number must be at most 100 characters"
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Only ADMIN and LOGISTICS users can update job numbers
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/{id}/adjust-pricing:
 *   patch:
 *     tags:
 *       - Order Management
 *     summary: Adjust logistics pricing for an order (ADMIN/LOGISTICS only)
 *     description: |
 *       Adjusts the logistics pricing for an order that is in PRICING_REVIEW status.
 *       This endpoint allows ADMIN and LOGISTICS users to manually override the calculated
 *       logistics pricing with a custom adjusted price and provide a reason for the adjustment.
 *
 *       **Business Logic:**
 *       - Order must be in PRICING_REVIEW status
 *       - Updates the logistics_pricing JSONB field with adjusted price and metadata
 *       - Automatically transitions order status to PENDING_APPROVAL
 *       - Creates a status history entry documenting the pricing adjustment
 *
 *       **Validation Rules:**
 *       - Adjusted price must be a positive number greater than 0
 *       - Adjustment reason is required and must be at least 10 characters
 *
 *       **Access Control:**
 *       - ADMIN and LOGISTICS users only
 *       - CLIENT users will receive a 403 Forbidden error
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - adjusted_price
 *               - adjustment_reason
 *             properties:
 *               adjusted_price:
 *                 type: number
 *                 format: float
 *                 minimum: 0
 *                 exclusiveMinimum: true
 *                 description: The adjusted logistics price (must be greater than 0)
 *                 example: 7500.00
 *               adjustment_reason:
 *                 type: string
 *                 minLength: 10
 *                 description: Reason for the pricing adjustment (minimum 10 characters)
 *                 example: "Special discount applied due to long-term partnership with client"
 *           examples:
 *             priceIncrease:
 *               summary: Price increase due to special requirements
 *               value:
 *                 adjusted_price: 8500.00
 *                 adjustment_reason: "Additional handling required for fragile items and extended delivery window"
 *             priceDecrease:
 *               summary: Price decrease for loyal customer
 *               value:
 *                 adjusted_price: 6000.00
 *                 adjustment_reason: "Loyalty discount applied for repeat customer with excellent payment history"
 *     responses:
 *       200:
 *         description: Logistics pricing adjusted successfully
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
 *                   example: "Logistics pricing adjusted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Order internal UUID
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     order_id:
 *                       type: string
 *                       description: Human-readable order ID
 *                       example: "ORD-20251227-001"
 *                     order_status:
 *                       type: string
 *                       description: Updated order status (always PENDING_APPROVAL after adjustment)
 *                       example: "PENDING_APPROVAL"
 *                     base_price:
 *                       type: number
 *                       format: float
 *                       nullable: true
 *                       description: Original base price from pricing tier (null if no tier matched)
 *                       example: 5000.00
 *                     adjusted_price:
 *                       type: number
 *                       format: float
 *                       description: The new adjusted logistics price
 *                       example: 7500.00
 *                     adjustment_reason:
 *                       type: string
 *                       description: Reason for the adjustment
 *                       example: "Special discount applied due to long-term partnership with client"
 *                     adjusted_at:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp when the adjustment was made
 *                       example: "2026-01-01T11:27:52.000Z"
 *                     adjusted_by:
 *                       type: object
 *                       description: User who made the adjustment
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                         name:
 *                           type: string
 *                           example: "John Admin"
 *                     company:
 *                       type: object
 *                       description: Company associated with the order
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "c3d4e5f6-a7b8-9012-cdef-123456789abc"
 *                         name:
 *                           type: string
 *                           example: "Diageo Events"
 *       400:
 *         description: Bad Request - Validation errors or order not in PRICING_REVIEW status
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
 *               notInPricingReview:
 *                 summary: Order not in PRICING_REVIEW status
 *                 value:
 *                   success: false
 *                   message: "Order is not in PRICING_REVIEW status"
 *               invalidPrice:
 *                 summary: Invalid adjusted price
 *                 value:
 *                   success: false
 *                   message: "Adjusted price must be greater than 0"
 *               shortReason:
 *                 summary: Adjustment reason too short
 *                 value:
 *                   success: false
 *                   message: "Adjustment reason must be at least 10 characters"
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Only ADMIN and LOGISTICS users can adjust pricing
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
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/{orderId}/scan-events:
 *   get:
 *     tags:
 *       - Order Management
 *     summary: Get order scan events (ADMIN/LOGISTICS only)
 *     description: |
 *       Retrieves all scan events for a specific order including:
 *       - Complete scan event data
 *       - Asset details (name, QR code, tracking method)
 *       - Scanned by user information
 *       - Order information
 *
 *       **Access Control:**
 *       - Only ADMIN and LOGISTICS users can access scan events
 *       - CLIENT users will receive a 403 Forbidden error
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: orderId
 *         in: path
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Scan events fetched successfully
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
 *                   example: "Scan events fetched successfully"
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
 *                       order_id:
 *                         type: string
 *                         format: uuid
 *                       asset_id:
 *                         type: string
 *                         format: uuid
 *                       scan_type:
 *                         type: string
 *                         enum: [IN, OUT]
 *                         description: Type of scan (IN for delivery, OUT for pickup)
 *                       quantity:
 *                         type: integer
 *                         description: Quantity scanned
 *                       condition:
 *                         type: string
 *                         enum: [GREEN, ORANGE, RED]
 *                         description: Asset condition at scan time
 *                       notes:
 *                         type: string
 *                         nullable: true
 *                         description: Additional notes about the scan
 *                       photos:
 *                         type: array
 *                         items:
 *                           type: string
 *                         description: URLs of photos taken during scan
 *                       discrepancy_reason:
 *                         type: string
 *                         nullable: true
 *                         description: Reason for any discrepancy found
 *                       scanned_by:
 *                         type: string
 *                         format: uuid
 *                         description: User ID who performed the scan
 *                       scanned_at:
 *                         type: string
 *                         format: date-time
 *                         description: Timestamp when scan was performed
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       asset:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                           qr_code:
 *                             type: string
 *                           tracking_method:
 *                             type: string
 *                             enum: [INDIVIDUAL, BATCH]
 *                       scanned_by_user:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                       order:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           order_id:
 *                             type: string
 *                             example: "ORD-20251227-001"
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Only ADMIN and LOGISTICS users can access scan events
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/submit-from-cart:
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

/**
 * @swagger
 * /api/client/v1/order/{id}/approve-platform-pricing:
 *   patch:
 *     tags:
 *       - Order Management
 *     summary: Approve platform pricing for an order (ADMIN only)
 *     description: |
 *       Approves platform pricing for an order in PENDING_APPROVAL status.
 *       This endpoint is used after logistics has adjusted pricing, allowing platform admins
 *       to review and approve the adjusted pricing with platform margin calculation.
 *
 *       **Workflow:**
 *       1. Validates order is in PENDING_APPROVAL status
 *       2. Accepts logistics base price and platform margin percent from admin
 *       3. Calculates platform margin amount and final total price
 *       4. Updates order with platform pricing details
 *       5. Transitions order status to QUOTED
 *       6. Updates financial status to QUOTE_SENT
 *       7. Logs status change in order history
 *
 *       **Access Control:**
 *       - ADMIN users only
 *
 *       **Pricing Calculation:**
 *       - Platform margin amount = logistics base price × platform margin %
 *       - Final total price = logistics base price + platform margin amount
 *
 *       **Use Case:**
 *       This endpoint is used when logistics has adjusted pricing (via adjust-pricing endpoint)
 *       and the order is in PENDING_APPROVAL status waiting for platform admin review.
 *
 *       **Error Cases:**
 *       - Order not found
 *       - Order not in PENDING_APPROVAL status
 *       - Invalid pricing values
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       description: Pricing details and optional notes for platform approval
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - logistics_base_price
 *               - platform_margin_percent
 *             properties:
 *               logistics_base_price:
 *                 type: number
 *                 format: float
 *                 description: Logistics base price (adjusted price from logistics team)
 *                 minimum: 0.01
 *                 example: 5500.00
 *               platform_margin_percent:
 *                 type: number
 *                 format: float
 *                 description: Platform margin percentage to apply
 *                 minimum: 0
 *                 maximum: 100
 *                 example: 25.00
 *               notes:
 *                 type: string
 *                 description: Optional notes about the pricing approval decision
 *                 example: "Approved adjusted pricing for special event requirements"
 *           examples:
 *             standardApproval:
 *               summary: Standard platform approval
 *               value:
 *                 logistics_base_price: 5500.00
 *                 platform_margin_percent: 25.00
 *                 notes: "Approved adjusted pricing"
 *             withCustomMargin:
 *               summary: Approval with custom margin
 *               value:
 *                 logistics_base_price: 6000.00
 *                 platform_margin_percent: 20.00
 *                 notes: "Special discount applied for long-term client"
 *     responses:
 *       200:
 *         description: Platform pricing approved successfully
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
 *                   example: "Platform pricing approved successfully. Quote sent to client."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Order internal UUID
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     order_id:
 *                       type: string
 *                       description: Human-readable order ID
 *                       example: "ORD-20260101-001"
 *                     order_status:
 *                       type: string
 *                       description: Updated order status (always QUOTED after approval)
 *                       example: "QUOTED"
 *                     financial_status:
 *                       type: string
 *                       description: Updated financial status (always QUOTE_SENT after approval)
 *                       example: "QUOTE_SENT"
 *                     pricing:
 *                       type: object
 *                       description: Calculated pricing details
 *                       properties:
 *                         logistics_adjusted_price:
 *                           type: number
 *                           format: float
 *                           description: Logistics base price (from request)
 *                           example: 5500.00
 *                         platform_margin_percent:
 *                           type: number
 *                           format: float
 *                           description: Platform margin percentage (from request)
 *                           example: 25.00
 *                         platform_margin_amount:
 *                           type: number
 *                           format: float
 *                           description: Calculated platform margin amount
 *                           example: 1375.00
 *                         final_total_price:
 *                           type: number
 *                           format: float
 *                           description: Total price (logistics + platform margin)
 *                           example: 6875.00
 *                     reviewed_at:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp when platform reviewed the pricing
 *                       example: "2026-01-01T16:17:00.000Z"
 *                     reviewed_by:
 *                       type: object
 *                       description: Admin user who approved the pricing
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "user-uuid"
 *                         name:
 *                           type: string
 *                           example: "Admin User"
 *                     review_notes:
 *                       type: string
 *                       nullable: true
 *                       description: Notes provided during approval
 *                       example: "Approved adjusted pricing"
 *                     quote_sent_at:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp when quote was sent to client
 *                       example: "2026-01-01T16:17:00.000Z"
 *             examples:
 *               successfulApproval:
 *                 summary: Successful platform pricing approval
 *                 value:
 *                   success: true
 *                   message: "Platform pricing approved successfully. Quote sent to client."
 *                   data:
 *                     id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     order_id: "ORD-20260101-001"
 *                     order_status: "QUOTED"
 *                     financial_status: "QUOTE_SENT"
 *                     pricing:
 *                       logistics_adjusted_price: 5500.00
 *                       platform_margin_percent: 25.00
 *                       platform_margin_amount: 1375.00
 *                       final_total_price: 6875.00
 *                     reviewed_at: "2026-01-01T16:17:00.000Z"
 *                     reviewed_by:
 *                       id: "user-uuid"
 *                       name: "Admin User"
 *                     review_notes: "Approved adjusted pricing"
 *                     quote_sent_at: "2026-01-01T16:17:00.000Z"
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
 *               wrongStatus:
 *                 summary: Order not in PENDING_APPROVAL status
 *                 value:
 *                   success: false
 *                   message: "Order is not in PENDING_APPROVAL status. Current status: QUOTED"
 *               invalidPrice:
 *                 summary: Invalid logistics base price
 *                 value:
 *                   success: false
 *                   message: "Logistics base price must be greater than 0"
 *               invalidMargin:
 *                 summary: Invalid platform margin percent
 *                 value:
 *                   success: false
 *                   message: "Platform margin percent must be between 0 and 100"
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
 *         description: Forbidden - Insufficient permissions (ADMIN only)
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
 *                   example: "You do not have permission to approve platform pricing"
 *       404:
 *         description: Not Found - Order not found
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
 * /api/client/v1/order/{id}/approve-quote:
 *   patch:
 *     tags:
 *       - Order Management
 *     summary: Approve quote (CLIENT only)
 *     description: |
 *       Allows a CLIENT user to approve a quote for their order.
 *
 *       **Business Logic:**
 *       - Verifies the order belongs to the client's company
 *       - Checks that the order is in QUOTED status
 *       - Validates asset availability for the event dates (including refurbishment buffer)
 *       - Creates asset bookings for all order items
 *       - Updates order status to CONFIRMED
 *       - Updates financial status to QUOTE_ACCEPTED
 *       - Logs the status change in order_status_history
 *
 *       **Access Control:**
 *       - CLIENT users only
 *       - Can only approve quotes for their own company's orders
 *
 *       **Status Transitions:**
 *       - Order Status: QUOTED → CONFIRMED
 *       - Financial Status: QUOTE_SENT → QUOTE_ACCEPTED
 *
 *       **Asset Booking:**
 *       - For each order item, creates an asset booking
 *       - Blocked period includes refurbishment days before and after the event
 *       - Validates sufficient asset availability before creating bookings
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ID (UUID or human-readable order ID)
 *         schema:
 *           type: string
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: Optional notes about the quote approval
 *                 example: "Approved for upcoming event"
 *           examples:
 *             withNotes:
 *               summary: Approval with notes
 *               value:
 *                 notes: "Approved for upcoming event"
 *             withoutNotes:
 *               summary: Approval without notes
 *               value: {}
 *     responses:
 *       200:
 *         description: Quote approved successfully
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
 *                   example: "Quote approved successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Order internal UUID
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     order_id:
 *                       type: string
 *                       description: Human-readable order ID
 *                       example: "ORD-20260102-001"
 *                     order_status:
 *                       type: string
 *                       description: Updated order status (always CONFIRMED after approval)
 *                       example: "CONFIRMED"
 *                     financial_status:
 *                       type: string
 *                       description: Updated financial status (always QUOTE_ACCEPTED after approval)
 *                       example: "QUOTE_ACCEPTED"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp when the order was updated
 *                       example: "2026-01-02T19:13:27.000Z"
 *             examples:
 *               successfulApproval:
 *                 summary: Successful quote approval
 *                 value:
 *                   success: true
 *                   message: "Quote approved successfully."
 *                   data:
 *                     id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     order_id: "ORD-20260102-001"
 *                     order_status: "CONFIRMED"
 *                     financial_status: "QUOTE_ACCEPTED"
 *                     updated_at: "2026-01-02T19:13:27.000Z"
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
 *               wrongStatus:
 *                 summary: Order not in QUOTED status
 *                 value:
 *                   success: false
 *                   message: "Order is not in QUOTED status"
 *               missingEventDates:
 *                 summary: Order missing event dates
 *                 value:
 *                   success: false
 *                   message: "Order must have event dates"
 *               insufficientAvailability:
 *                 summary: Insufficient asset availability
 *                 value:
 *                   success: false
 *                   message: "Insufficient availability for Display Stand. Available: 5, Requested: 10"
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
 *         description: Forbidden - Insufficient permissions (CLIENT only)
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
 *                   example: "You do not have permission to approve quotes"
 *       404:
 *         description: Not Found - Order not found or access denied
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
 *                   example: "Order not found or you do not have access to this order"
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
 * /api/client/v1/order/{id}/decline-quote:
 *   patch:
 *     tags:
 *       - Order Management
 *     summary: Decline a quote (CLIENT only)
 *     description: |
 *       Allows a CLIENT user to decline a quote for an order in QUOTED status.
 *
 *       **Business Logic:**
 *       - Order must be in `QUOTED` status
 *       - User must belong to the same company as the order
 *       - Decline reason must be at least 10 characters
 *       - Order status will be updated to `DECLINED`
 *       - Status change will be logged in order history
 *       - Notification will be sent to relevant parties
 *
 *       **Access Control:**
 *       - CLIENT users only
 *       - User must have access to the order (same company)
 *
 *       **Status Transition:**
 *       - QUOTED → DECLINED
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: id
 *         in: path
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - decline_reason
 *             properties:
 *               decline_reason:
 *                 type: string
 *                 minLength: 10
 *                 description: Reason for declining the quote (minimum 10 characters)
 *                 example: "The pricing is higher than our budget allows for this event."
 *           examples:
 *             budgetConstraint:
 *               summary: Budget constraint
 *               value:
 *                 decline_reason: "The pricing is higher than our budget allows for this event."
 *             alternativeVendor:
 *               summary: Alternative vendor selected
 *               value:
 *                 decline_reason: "We have decided to proceed with an alternative vendor for this event."
 *             eventCancelled:
 *               summary: Event cancelled
 *               value:
 *                 decline_reason: "The event has been cancelled, so we no longer need these assets."
 *             scopeChange:
 *               summary: Scope change
 *               value:
 *                 decline_reason: "Our event requirements have changed significantly, and we need to submit a new order."
 *     responses:
 *       200:
 *         description: Quote declined successfully
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
 *                   example: "Quote declined successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Order internal UUID
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     order_id:
 *                       type: string
 *                       description: Human-readable order ID
 *                       example: "ORD-20260103-001"
 *                     order_status:
 *                       type: string
 *                       description: Updated order status
 *                       example: "DECLINED"
 *                       enum: [DECLINED]
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp when the order was declined
 *                       example: "2026-01-03T12:15:00.000Z"
 *             example:
 *               success: true
 *               message: "Quote declined successfully."
 *               data:
 *                 id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                 order_id: "ORD-20260103-001"
 *                 order_status: "DECLINED"
 *                 updated_at: "2026-01-03T12:15:00.000Z"
 *       400:
 *         description: Bad Request - Validation errors or invalid status
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
 *               invalidStatus:
 *                 summary: Order not in QUOTED status
 *                 value:
 *                   success: false
 *                   message: "Order is not in QUOTED status. Current status: CONFIRMED"
 *               shortDeclineReason:
 *                 summary: Decline reason too short
 *                 value:
 *                   success: false
 *                   message: "Decline reason is required and must be at least 10 characters"
 *               missingDeclineReason:
 *                 summary: Missing decline reason
 *                 value:
 *                   success: false
 *                   message: "Decline reason should be a text"
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
 *                   example: "Unauthorized"
 *       403:
 *         description: Forbidden - Insufficient permissions or no access to order
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
 *               noAccess:
 *                 summary: No access to order
 *                 value:
 *                   success: false
 *                   message: "Order not found or you do not have access to this order"
 *               wrongRole:
 *                 summary: Wrong user role
 *                 value:
 *                   success: false
 *                   message: "Forbidden - CLIENT role required"
 *       404:
 *         description: Not Found - Order does not exist
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
 *                   example: "Order not found or you do not have access to this order"
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
 *                   example: "Internal server error"
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/dashboard-summary:
 *   get:
 *     tags:
 *       - Order Management
 *     summary: Get order statistics (CLIENT only)
 *     description: |
 *       Retrieves order statistics and recent orders for the authenticated client user's company.
 *
 *       **Statistics Provided:**
 *       - **Active Orders**: Orders in progress (CONFIRMED, IN_PREPARATION, READY_FOR_DELIVERY, IN_TRANSIT, DELIVERED, IN_USE, AWAITING_RETURN)
 *       - **Pending Quotes**: Orders in QUOTED status awaiting client approval
 *       - **Upcoming Events**: Future events (event_start_date >= today) in CONFIRMED or IN_PREPARATION status
 *       - **Awaiting Return**: Orders in AWAITING_RETURN status
 *       - **Recent Orders**: Last 5 orders sorted by creation date
 *
 *       **Access Control:**
 *       - CLIENT users only
 *       - User must have a valid company ID
 *       - Only shows orders from user's company
 *
 *       **Performance:**
 *       - Optimized with single database query
 *       - In-memory processing for counts
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *     responses:
 *       200:
 *         description: Order statistics fetched successfully
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
 *                   example: "Order statistics fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       description: Order counts by category
 *                       properties:
 *                         active_orders:
 *                           type: integer
 *                           description: Count of orders in active statuses (CONFIRMED, IN_PREPARATION, READY_FOR_DELIVERY, IN_TRANSIT, DELIVERED, IN_USE, AWAITING_RETURN)
 *                           example: 12
 *                         pending_quotes:
 *                           type: integer
 *                           description: Count of orders in QUOTED status
 *                           example: 3
 *                         upcoming_events:
 *                           type: integer
 *                           description: Count of future events in CONFIRMED or IN_PREPARATION status
 *                           example: 5
 *                         awaiting_return:
 *                           type: integer
 *                           description: Count of orders in AWAITING_RETURN status
 *                           example: 2
 *                     recent_orders:
 *                       type: array
 *                       description: Last 5 orders sorted by creation date (newest first)
 *                       maxItems: 5
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             description: Order internal UUID
 *                             example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                           order_id:
 *                             type: string
 *                             description: Human-readable order ID
 *                             example: "ORD-20260103-001"
 *                           venue_name:
 *                             type: string
 *                             description: Event venue name
 *                             example: "Dubai World Trade Centre"
 *                           event_start_date:
 *                             type: string
 *                             format: date-time
 *                             description: Event start date
 *                             example: "2026-02-15T00:00:00.000Z"
 *                           event_end_date:
 *                             type: string
 *                             format: date-time
 *                             description: Event end date
 *                             example: "2026-02-17T00:00:00.000Z"
 *                           order_status:
 *                             type: string
 *                             description: Current order status
 *                             enum: [DRAFT, SUBMITTED, PRICING_REVIEW, PENDING_APPROVAL, QUOTED, DECLINED, CONFIRMED, IN_PREPARATION, READY_FOR_DELIVERY, IN_TRANSIT, DELIVERED, IN_USE, AWAITING_RETURN, CLOSED]
 *                             example: "CONFIRMED"
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             description: Order creation timestamp
 *                             example: "2026-01-03T12:00:00.000Z"
 *             example:
 *               success: true
 *               message: "Order statistics fetched successfully"
 *               data:
 *                 summary:
 *                   active_orders: 12
 *                   pending_quotes: 3
 *                   upcoming_events: 5
 *                   awaiting_return: 2
 *                 recent_orders:
 *                   - id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     order_id: "ORD-20260103-001"
 *                     venue_name: "Dubai World Trade Centre"
 *                     event_start_date: "2026-02-15T00:00:00.000Z"
 *                     event_end_date: "2026-02-17T00:00:00.000Z"
 *                     order_status: "CONFIRMED"
 *                     created_at: "2026-01-03T12:00:00.000Z"
 *       400:
 *         description: Bad Request - Missing company ID
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
 *                   example: "Company ID is required"
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
 *                   example: "Unauthorized"
 *       403:
 *         description: Forbidden - CLIENT role required
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
 *                   example: "Forbidden - CLIENT role required"
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
 *                   example: "Internal server error"
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/order/{orderId}/send-invoice:
 *   patch:
 *     tags:
 *       - Order Management
 *     summary: Send invoice for an order (ADMIN only)
 *     description: |
 *       Updates the financial status of an order to INVOICED.
 *       This endpoint is used to mark an order as invoiced after it has been closed.
 *
 *       **Business Rules:**
 *       - Order must be in CLOSED status
 *       - Order must not already be invoiced (financial_status !== INVOICED)
 *
 *       **Status Transitions:**
 *       - Financial Status: Any (except INVOICED) → INVOICED
 *
 *       **Access Control:**
 *       - ADMIN users only
 *
 *       **Use Case:**
 *       This endpoint is called when an admin wants to mark an order as invoiced
 *       after the order has been completed and closed.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: orderId
 *         in: path
 *         required: true
 *         description: Order ID (UUID)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Invoice sent successfully
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
 *                   example: "Invoice sent successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Order internal UUID
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     order_id:
 *                       type: string
 *                       description: Human-readable order ID
 *                       example: "ORD-20260109-001"
 *                     financial_status:
 *                       type: string
 *                       description: Updated financial status (always INVOICED after success)
 *                       example: "INVOICED"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp when the order was updated
 *                       example: "2026-01-09T14:48:00.000Z"
 *             example:
 *               success: true
 *               message: "Invoice sent successfully."
 *               data:
 *                 id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                 order_id: "ORD-20260109-001"
 *                 financial_status: "INVOICED"
 *                 updated_at: "2026-01-09T14:48:00.000Z"
 *       400:
 *         description: Bad request - Order not in correct status
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
 *               alreadyInvoiced:
 *                 summary: Order already invoiced
 *                 value:
 *                   success: false
 *                   message: "Order is already invoiced"
 *               notClosed:
 *                 summary: Order not in CLOSED status
 *                 value:
 *                   success: false
 *                   message: "Order is not in CLOSED status"
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
 *                   example: "Unauthorized"
 *       403:
 *         description: Forbidden - ADMIN role required
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
 *                   example: "Forbidden - ADMIN role required"
 *       404:
 *         description: Not Found - Order not found
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
 *                   example: "Internal server error"
 *     security:
 *       - BearerAuth: []
 */
