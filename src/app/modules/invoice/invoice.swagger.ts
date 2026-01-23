/**
 * @swagger
 * /api/client/v1/invoice:
 *   get:
 *     tags:
 *       - Invoice Management
 *     summary: Get invoices list with order information
 *     description: |
 *       Retrieves a paginated list of invoices with associated order and company information.
 *
 *       **Features:**
 *       - Pagination support (page, limit)
 *       - Sorting by invoice_id, created_at, or updated_at
 *       - Search by invoice ID
 *       - Filter by order ID, payment status, or company
 *
 *       **Access Control:**
 *       - ADMIN and LOGISTICS users can see all invoices
 *       - CLIENT users can only see invoices for their company's orders
 *
 *       **Performance:**
 *       - Optimized with proper indexing
 *       - Efficient joins with orders and companies tables
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: page
 *         in: query
 *         description: Page number for pagination
 *         schema:
 *           type: integer
 *           default: 1
 *           example: 1
 *       - name: limit
 *         in: query
 *         description: Number of items per page
 *         schema:
 *           type: integer
 *           default: 10
 *           example: 20
 *       - name: sort_by
 *         in: query
 *         description: Field to sort by
 *         schema:
 *           type: string
 *           enum: [invoice_id, created_at, updated_at]
 *           default: created_at
 *           example: created_at
 *       - name: sort_order
 *         in: query
 *         description: Sort order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *           example: desc
 *       - name: search_term
 *         in: query
 *         description: Search by invoice ID (partial match)
 *         schema:
 *           type: string
 *           example: "INV-2026"
 *       - name: order_id
 *         in: query
 *         description: Filter by order ID
 *         schema:
 *           type: string
 *           example: "ORD-20260103-001"
 *       - name: invoice_id
 *         in: query
 *         description: Filter by invoice ID
 *         schema:
 *           type: string
 *           example: "INV-20260103-001"
 *       - name: paid_status
 *         in: query
 *         description: Filter by payment status
 *         schema:
 *           type: string
 *           enum: [paid, unpaid]
 *           example: "unpaid"
 *       - name: company_id
 *         in: query
 *         description: Filter by company ID (ADMIN/LOGISTICS only)
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *     responses:
 *       200:
 *         description: Invoices fetched successfully
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
 *                   example: "Invoices fetched successfully"
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
 *                       description: Total number of invoices matching the filters
 *                       example: 25
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                         description: Invoice internal UUID
 *                         example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                       invoice_id:
 *                         type: string
 *                         description: Human-readable invoice ID
 *                         example: "INV-20260103-001"
 *                       invoice_pdf_url:
 *                         type: string
 *                         description: S3 URL of the invoice PDF
 *                         example: "s3://bucket/invoices/company-name/INV-20260103-001.pdf"
 *                       invoice_paid_at:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                         description: Timestamp when invoice was paid (null if unpaid)
 *                         example: "2026-01-05T10:00:00.000Z"
 *                       payment_method:
 *                         type: string
 *                         nullable: true
 *                         description: Payment method used
 *                         example: "bank_transfer"
 *                       payment_reference:
 *                         type: string
 *                         nullable: true
 *                         description: Payment reference number
 *                         example: "REF123456"
 *                       order:
 *                         type: object
 *                         description: Associated order information
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                           order_id:
 *                             type: string
 *                             example: "ORD-20260103-001"
 *                           contact_name:
 *                             type: string
 *                             example: "John Doe"
 *                           event_start_date:
 *                             type: string
 *                             format: date-time
 *                             example: "2026-02-15T00:00:00.000Z"
 *                           venue_name:
 *                             type: string
 *                             example: "Dubai World Trade Centre"
 *                           final_pricing:
 *                             type: object
 *                             nullable: true
 *                             description: Final pricing details
 *                             properties:
 *                               total_price:
 *                                 type: number
 *                                 example: 5000.00
 *                               quote_sent_at:
 *                                 type: string
 *                                 format: date-time
 *                                 example: "2026-01-03T14:00:00.000Z"
 *                       company:
 *                         type: object
 *                         description: Company information
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                             example: "c3d4e5f6-a7b8-9012-cdef-123456789012"
 *                           name:
 *                             type: string
 *                             example: "Diageo"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         description: Invoice creation timestamp
 *                         example: "2026-01-03T12:00:00.000Z"
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                         description: Invoice last update timestamp
 *                         example: "2026-01-05T10:00:00.000Z"
 *             examples:
 *               success:
 *                 summary: Successful response with invoices
 *                 value:
 *                   success: true
 *                   message: "Invoices fetched successfully"
 *                   meta:
 *                     page: 1
 *                     limit: 10
 *                     total: 25
 *                   data:
 *                     - id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                       invoice_id: "INV-20260103-001"
 *                       invoice_pdf_url: "s3://bucket/invoices/diageo/INV-20260103-001.pdf"
 *                       invoice_paid_at: "2026-01-05T10:00:00.000Z"
 *                       payment_method: "bank_transfer"
 *                       payment_reference: "REF123456"
 *                       order:
 *                         id: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                         order_id: "ORD-20260103-001"
 *                         contact_name: "John Doe"
 *                         event_start_date: "2026-02-15T00:00:00.000Z"
 *                         venue_name: "Dubai World Trade Centre"
 *                         final_pricing:
 *                           total_price: 5000.00
 *                           quote_sent_at: "2026-01-03T14:00:00.000Z"
 *                       company:
 *                         id: "c3d4e5f6-a7b8-9012-cdef-123456789012"
 *                         name: "Diageo"
 *                       created_at: "2026-01-03T12:00:00.000Z"
 *                       updated_at: "2026-01-05T10:00:00.000Z"
 *       400:
 *         description: Bad Request - Invalid query parameters
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
 *               invalidSortBy:
 *                 summary: Invalid sort_by value
 *                 value:
 *                   success: false
 *                   message: "Invalid value(s) for 'sort_by': invalid_field. Allowed values: invoice_id, created_at, updated_at"
 *               invalidPaidStatus:
 *                 summary: Invalid paid_status value
 *                 value:
 *                   success: false
 *                   message: "Invalid value(s) for 'paid_status': invalid. Allowed values: paid, unpaid"
 *               invalidCompanyId:
 *                 summary: Invalid company_id format
 *                 value:
 *                   success: false
 *                   message: "Invalid value for 'company_id': not-a-uuid. Valid UUID format required."
 *               missingCompanyId:
 *                 summary: CLIENT user missing company ID
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
 *                   example: "Unauthorized"
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
 *                   example: "Forbidden - Insufficient permissions"
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
 * /api/client/v1/invoice/{invoiceId}:
 *   get:
 *     tags:
 *       - Invoice Management
 *     summary: Get single invoice by ID
 *     description: |
 *       Retrieves a single invoice with order and company information.
 *
 *       **Flexible ID Lookup:**
 *       - Accepts both internal UUID and human-readable invoice_id
 *       - Automatic detection of ID format
 *
 *       **Includes:**
 *       - Complete invoice details
 *       - Associated order information
 *       - Company details
 *       - Payment status and references
 *
 *       **Access Control:**
 *       - ADMIN and LOGISTICS users can access all invoices
 *       - CLIENT users can only access invoices for their company's orders
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: invoiceId
 *         in: path
 *         required: true
 *         description: Invoice identifier (UUID or invoice_id)
 *         schema:
 *           type: string
 *         examples:
 *           uuid:
 *             summary: Internal UUID
 *             value: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *           invoiceId:
 *             summary: Invoice ID
 *             value: "INV-20260103-001"
 *     responses:
 *       200:
 *         description: Invoice fetched successfully
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
 *                   example: "Invoice fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Invoice internal UUID
 *                       example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     invoice_id:
 *                       type: string
 *                       description: Human-readable invoice ID
 *                       example: "INV-20260103-001"
 *                     invoice_pdf_url:
 *                       type: string
 *                       description: S3 URL of the invoice PDF
 *                       example: "s3://bucket/invoices/company-name/INV-20260103-001.pdf"
 *                     invoice_paid_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                       description: Timestamp when invoice was paid (null if unpaid)
 *                       example: "2026-01-05T10:00:00.000Z"
 *                     payment_method:
 *                       type: string
 *                       nullable: true
 *                       description: Payment method used
 *                       example: "bank_transfer"
 *                     payment_reference:
 *                       type: string
 *                       nullable: true
 *                       description: Payment reference number
 *                       example: "REF123456"
 *                     order:
 *                       type: object
 *                       description: Associated order information
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                         order_id:
 *                           type: string
 *                           example: "ORD-20260103-001"
 *                         contact_name:
 *                           type: string
 *                           example: "John Doe"
 *                         event_start_date:
 *                           type: string
 *                           format: date-time
 *                           example: "2026-02-15T00:00:00.000Z"
 *                         event_end_date:
 *                           type: string
 *                           format: date-time
 *                           example: "2026-02-17T00:00:00.000Z"
 *                         venue_name:
 *                           type: string
 *                           example: "Dubai World Trade Centre"
 *                         final_pricing:
 *                           type: object
 *                           nullable: true
 *                           description: Final pricing details
 *                           properties:
 *                             total_price:
 *                               type: number
 *                               example: 5000.00
 *                             quote_sent_at:
 *                               type: string
 *                               format: date-time
 *                               example: "2026-01-03T14:00:00.000Z"
 *                         order_status:
 *                           type: string
 *                           description: Current order status
 *                           example: "CONFIRMED"
 *                         financial_status:
 *                           type: string
 *                           description: Financial status
 *                           example: "INVOICED"
 *                     company:
 *                       type: object
 *                       description: Company information
 *                       properties:
 *                         id:
 *                           type: string
 *                           format: uuid
 *                           example: "c3d4e5f6-a7b8-9012-cdef-123456789012"
 *                         name:
 *                           type: string
 *                           example: "Diageo"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       description: Invoice creation timestamp
 *                       example: "2026-01-03T12:00:00.000Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       description: Invoice last update timestamp
 *                       example: "2026-01-05T10:00:00.000Z"
 *             examples:
 *               paidInvoice:
 *                 summary: Paid invoice
 *                 value:
 *                   success: true
 *                   message: "Invoice fetched successfully"
 *                   data:
 *                     id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *                     invoice_id: "INV-20260103-001"
 *                     invoice_pdf_url: "s3://bucket/invoices/diageo/INV-20260103-001.pdf"
 *                     invoice_paid_at: "2026-01-05T10:00:00.000Z"
 *                     payment_method: "bank_transfer"
 *                     payment_reference: "REF123456"
 *                     order:
 *                       id: "b2c3d4e5-f6a7-8901-bcde-f12345678901"
 *                       order_id: "ORD-20260103-001"
 *                       contact_name: "John Doe"
 *                       event_start_date: "2026-02-15T00:00:00.000Z"
 *                       event_end_date: "2026-02-17T00:00:00.000Z"
 *                       venue_name: "Dubai World Trade Centre"
 *                       final_pricing:
 *                         total_price: 5000.00
 *                         quote_sent_at: "2026-01-03T14:00:00.000Z"
 *                       order_status: "CONFIRMED"
 *                       financial_status: "INVOICED"
 *                     company:
 *                       id: "c3d4e5f6-a7b8-9012-cdef-123456789012"
 *                       name: "Diageo"
 *                     created_at: "2026-01-03T12:00:00.000Z"
 *                     updated_at: "2026-01-05T10:00:00.000Z"
 *               unpaidInvoice:
 *                 summary: Unpaid invoice
 *                 value:
 *                   success: true
 *                   message: "Invoice fetched successfully"
 *                   data:
 *                     id: "d4e5f6a7-b8c9-0123-def4-567890123456"
 *                     invoice_id: "INV-20260102-005"
 *                     invoice_pdf_url: "s3://bucket/invoices/heineken/INV-20260102-005.pdf"
 *                     invoice_paid_at: null
 *                     payment_method: null
 *                     payment_reference: null
 *                     order:
 *                       id: "e5f6a7b8-c9d0-1234-ef56-789012345678"
 *                       order_id: "ORD-20260102-005"
 *                       contact_name: "Jane Smith"
 *                       event_start_date: "2026-03-10T00:00:00.000Z"
 *                       event_end_date: "2026-03-12T00:00:00.000Z"
 *                       venue_name: "Abu Dhabi Convention Centre"
 *                       final_pricing:
 *                         total_price: 3500.00
 *                         quote_sent_at: "2026-01-02T16:00:00.000Z"
 *                       order_status: "DELIVERED"
 *                       financial_status: "INVOICED"
 *                     company:
 *                       id: "f6a7b8c9-d0e1-2345-f678-901234567890"
 *                       name: "Heineken"
 *                     created_at: "2026-01-02T15:30:00.000Z"
 *                     updated_at: "2026-01-02T15:30:00.000Z"
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
 *         description: Forbidden - Access denied to this invoice
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
 *                 summary: CLIENT user accessing another company's invoice
 *                 value:
 *                   success: false
 *                   message: "You don't have access to this invoice"
 *       404:
 *         description: Invoice not found
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
 *                   example: "Invoice not found"
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
 * /api/client/v1/invoice/download/{invoiceId}:
 *   get:
 *     tags:
 *       - Invoice Management
 *     summary: Get invoice download URL
 *     description: |
 *       Generates a presigned URL for downloading an invoice PDF.
 *       The URL is valid for 1 hour.
 *
 *       **Access Control:**
 *       - ADMIN and LOGISTICS users can access all invoices
 *       - CLIENT users can only access invoices for their company's orders
 *
 *       **Use Case:**
 *       - Use this endpoint when you want to redirect users to download the PDF
 *       - The presigned URL can be shared or used in email links
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: invoiceId
 *         in: path
 *         required: true
 *         description: Invoice ID (e.g., INV-20260103-001)
 *         schema:
 *           type: string
 *           example: "INV-20260103-001"
 *     responses:
 *       200:
 *         description: Download URL generated successfully
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
 *                   example: "Invoice download URL generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoice_id:
 *                       type: string
 *                       example: "INV-20260103-001"
 *                     download_url:
 *                       type: string
 *                       description: Presigned S3 URL valid for 1 hour
 *                       example: "https://invoices.s3.eu-west-1.amazonaws.com/invoices/Company/INV-20260103-001.pdf?X-Amz-Algorithm=..."
 *                     expires_in:
 *                       type: integer
 *                       description: URL expiration time in seconds
 *                       example: 3600
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Access denied to this invoice
 *       404:
 *         description: Invoice not found
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/invoice/download-pdf/{invoiceId}:
 *   get:
 *     tags:
 *       - Invoice Management
 *     summary: Download invoice PDF directly
 *     description: |
 *       Downloads the invoice PDF file directly from the server.
 *       The PDF is streamed to the client as an attachment.
 *
 *       **Access Control:**
 *       - ADMIN and LOGISTICS users can download all invoices
 *       - CLIENT users can only download invoices for their company's orders
 *
 *       **Use Case:**
 *       - Use this endpoint for direct PDF downloads in the browser
 *       - The browser will prompt to save the file
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: invoiceId
 *         in: path
 *         required: true
 *         description: Invoice ID (e.g., INV-20260103-001)
 *         schema:
 *           type: string
 *           example: "INV-20260103-001"
 *     responses:
 *       200:
 *         description: PDF file download
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Disposition:
 *             description: Attachment filename
 *             schema:
 *               type: string
 *               example: 'attachment; filename="INV-20260103-001.pdf"'
 *           Content-Type:
 *             description: PDF content type
 *             schema:
 *               type: string
 *               example: 'application/pdf'
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Access denied to this invoice
 *       404:
 *         description: Invoice not found
 *       500:
 *         description: Internal server error
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * /api/client/v1/invoice/{orderId}/confirm-payment:
 *   patch:
 *     tags:
 *       - Invoice Management
 *     summary: Confirm payment for an invoice
 *     description: |
 *       Confirms payment for an invoice by recording payment details and updating the order's financial status to PAID.
 *
 *       **Transaction Safety:**
 *       - All updates (invoice, order, status history) are performed in a database transaction
 *       - Ensures data consistency across all related tables
 *
 *       **What This Endpoint Does:**
 *       1. Validates the invoice exists and is not already paid
 *       2. Validates payment date (cannot be in the future)
 *       3. Updates invoice with payment details (method, reference, date)
 *       4. Updates order financial status to PAID
 *       5. Creates a financial status history entry for audit trail
 *
 *       **Access Control:**
 *       - ADMIN users only
 *       - LOGISTICS and CLIENT users cannot confirm payments
 *
 *       **Validation Rules:**
 *       - Invoice must exist
 *       - Invoice must not already be paid
 *       - Payment date cannot be in the future
 *       - Payment method is required (max 50 characters)
 *       - Payment reference is required (max 100 characters)
 *       - Notes are optional
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: orderId
 *         in: path
 *         required: true
 *         description: Order identifier (UUID or order_id like ORD-20260103-001)
 *         schema:
 *           type: string
 *         examples:
 *           uuid:
 *             summary: Internal UUID
 *             value: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 *           orderId:
 *             summary: Order ID
 *             value: "ORD-20260103-001"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - payment_method
 *               - payment_reference
 *             properties:
 *               payment_method:
 *                 type: string
 *                 description: Payment method used (e.g., bank_transfer, credit_card, cash, cheque)
 *                 minLength: 1
 *                 maxLength: 50
 *                 example: "bank_transfer"
 *               payment_reference:
 *                 type: string
 *                 description: Payment reference number or transaction ID
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: "TXN-2026-001234"
 *               payment_date:
 *                 type: string
 *                 format: date-time
 *                 description: Payment date (ISO 8601 format). Defaults to current date if not provided. Cannot be in the future.
 *                 example: "2026-01-05T14:30:00.000Z"
 *               notes:
 *                 type: string
 *                 description: Optional notes about the payment
 *                 example: "Payment received via wire transfer from Diageo Finance Department"
 *           examples:
 *             bankTransfer:
 *               summary: Bank transfer payment
 *               value:
 *                 payment_method: "bank_transfer"
 *                 payment_reference: "TXN-2026-001234"
 *                 payment_date: "2026-01-05T14:30:00.000Z"
 *                 notes: "Payment received via wire transfer"
 *             creditCard:
 *               summary: Credit card payment
 *               value:
 *                 payment_method: "credit_card"
 *                 payment_reference: "CC-AUTH-789456"
 *                 notes: "Paid via Visa ending in 4242"
 *             cash:
 *               summary: Cash payment (no date specified)
 *               value:
 *                 payment_method: "cash"
 *                 payment_reference: "CASH-REC-2026-001"
 *                 notes: "Cash payment received at office"
 *     responses:
 *       200:
 *         description: Payment confirmed successfully
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
 *                   example: "Payment confirmed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoice_id:
 *                       type: string
 *                       description: Human-readable invoice ID
 *                       example: "INV-20260103-001"
 *                     invoice_paid_at:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp when payment was confirmed
 *                       example: "2026-01-05T14:30:00.000Z"
 *                     invoice_pdf_url:
 *                       type: string
 *                       description: S3 URL of the invoice PDF
 *                       example: "s3://bucket/invoices/company-name/INV-20260103-001.pdf"
 *                     payment_method:
 *                       type: string
 *                       description: Payment method used
 *                       example: "bank_transfer"
 *                     payment_reference:
 *                       type: string
 *                       description: Payment reference number
 *                       example: "TXN-2026-001234"
 *                     order_id:
 *                       type: string
 *                       description: Associated order ID
 *                       example: "ORD-20260103-001"
 *             examples:
 *               success:
 *                 summary: Successful payment confirmation
 *                 value:
 *                   success: true
 *                   message: "Payment confirmed successfully"
 *                   data:
 *                     invoice_id: "INV-20260103-001"
 *                     invoice_paid_at: "2026-01-05T14:30:00.000Z"
 *                     invoice_pdf_url: "s3://bucket/invoices/diageo/INV-20260103-001.pdf"
 *                     payment_method: "bank_transfer"
 *                     payment_reference: "TXN-2026-001234"
 *                     order_id: "ORD-20260103-001"
 *       400:
 *         description: Bad Request - Validation errors
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
 *               alreadyPaid:
 *                 summary: Invoice already paid
 *                 value:
 *                   success: false
 *                   message: "Payment already confirmed for this invoice"
 *               futureDate:
 *                 summary: Payment date in the future
 *                 value:
 *                   success: false
 *                   message: "Payment date cannot be in the future"
 *               invalidDate:
 *                 summary: Invalid payment date format
 *                 value:
 *                   success: false
 *                   message: "Invalid payment date format"
 *               missingMethod:
 *                 summary: Missing payment method
 *                 value:
 *                   success: false
 *                   message: "Payment method is required"
 *               missingReference:
 *                 summary: Missing payment reference
 *                 value:
 *                   success: false
 *                   message: "Payment reference is required"
 *               methodTooLong:
 *                 summary: Payment method exceeds max length
 *                 value:
 *                   success: false
 *                   message: "Payment method should be less than 50 characters"
 *               referenceTooLong:
 *                 summary: Payment reference exceeds max length
 *                 value:
 *                   success: false
 *                   message: "Payment reference should be less than 100 characters"
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
 *             examples:
 *               notAdmin:
 *                 summary: Non-ADMIN user attempting to confirm payment
 *                 value:
 *                   success: false
 *                   message: "Forbidden - Insufficient permissions"
 *       404:
 *         description: Invoice not found
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
 *                   example: "Invoice not found"
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
