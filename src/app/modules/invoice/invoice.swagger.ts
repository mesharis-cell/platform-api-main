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
