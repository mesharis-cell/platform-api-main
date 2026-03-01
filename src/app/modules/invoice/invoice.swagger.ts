/**
 * Invoice module is intentionally stubbed in this pre-alpha branch.
 * Operational quote/cost-estimate flows remain active.
 */

/**
 * @swagger
 * /api/client/v1/invoice:
 *   get:
 *     summary: Invoicing stub endpoint
 *     tags: [Invoices]
 *     responses:
 *       501:
 *         description: Invoicing is disabled in this pre-alpha branch
 */

/**
 * @swagger
 * /api/client/v1/invoice/generate:
 *   post:
 *     summary: Invoicing stub endpoint
 *     tags: [Invoices]
 *     responses:
 *       501:
 *         description: Invoicing is disabled in this pre-alpha branch
 */

/**
 * @swagger
 * /api/client/v1/invoice/{invoiceId}:
 *   get:
 *     summary: Invoicing stub endpoint
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       501:
 *         description: Invoicing is disabled in this pre-alpha branch
 */

/**
 * @swagger
 * /api/client/v1/invoice/download/{invoiceId}:
 *   get:
 *     summary: Invoicing stub endpoint
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       501:
 *         description: Invoicing is disabled in this pre-alpha branch
 */

/**
 * @swagger
 * /api/client/v1/invoice/download-pdf/{invoiceId}:
 *   get:
 *     summary: Invoicing stub endpoint
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       501:
 *         description: Invoicing is disabled in this pre-alpha branch
 */

/**
 * @swagger
 * /api/client/v1/invoice/{orderId}/confirm-payment:
 *   patch:
 *     summary: Invoicing stub endpoint
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       501:
 *         description: Invoicing is disabled in this pre-alpha branch
 */

/**
 * @swagger
 * /api/client/v1/invoice/download-cost-estimate-pdf/{orderId}:
 *   get:
 *     summary: Download order cost estimate PDF
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF returned
 */

/**
 * @swagger
 * /api/client/v1/invoice/download-ir-cost-estimate-pdf/{requestId}:
 *   get:
 *     summary: Download inbound request cost estimate PDF
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF returned
 */

/**
 * @swagger
 * /api/client/v1/invoice/download-sr-cost-estimate-pdf/{requestId}:
 *   get:
 *     summary: Download service request cost estimate PDF
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF returned
 */
