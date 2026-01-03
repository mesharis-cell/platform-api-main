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
