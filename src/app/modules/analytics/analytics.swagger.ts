/**
 * @swagger
 * tags:
 *   - name: Analytics
 *     description: Analytics and reporting endpoints for revenue, margins, and order metrics
 */

/**
 * @swagger
 * /api/client/v1/analytics/time-series:
 *   get:
 *     tags:
 *       - Analytics
 *     summary: Get time series data
 *     description: |
 *       Retrieves time series analytics data including revenue, margins, and order counts.
 *       Data can be grouped by month, quarter, or year.
 *
 *       **Access Control:**
 *       - ADMIN users only
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: groupBy
 *         in: query
 *         required: true
 *         description: Time period grouping for the data
 *         schema:
 *           type: string
 *           enum: [month, quarter, year]
 *           example: "month"
 *       - name: companyId
 *         in: query
 *         description: Filter by company ID
 *         schema:
 *           type: string
 *           format: uuid
 *       - name: startDate
 *         in: query
 *         description: Filter data from this date (ISO 8601)
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-01-01"
 *       - name: endDate
 *         in: query
 *         description: Filter data until this date (ISO 8601)
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-12-31"
 *     responses:
 *       200:
 *         description: Time series data fetched successfully
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
 *                   example: "Time series data fetched successfully"
 *                 data:
 *                   $ref: '#/components/schemas/TimeSeries'
 *       401:
 *         description: Unauthorized - Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - ADMIN access required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *     security:
 *       - BearerAuth: []
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     TimeSeries:
 *       type: object
 *       description: Time series analytics data response
 *       properties:
 *         timeSeries:
 *           type: array
 *           description: Array of time period metrics
 *           items:
 *             $ref: '#/components/schemas/TimePeriodMetrics'
 *         filters:
 *           type: object
 *           description: Applied filters for the query
 *           properties:
 *             companyId:
 *               type: string
 *               format: uuid
 *               nullable: true
 *               description: Company ID filter (null if not filtered)
 *             companyName:
 *               type: string
 *               description: Company name or "All Companies"
 *               example: "All Companies"
 *             groupBy:
 *               type: string
 *               enum: [month, quarter, year]
 *               description: Time grouping used
 *               example: "month"
 *             startDate:
 *               type: string
 *               format: date
 *               description: Start date filter
 *               example: "2025-01-01"
 *             endDate:
 *               type: string
 *               format: date
 *               description: End date filter
 *               example: "2025-12-31"
 *         totals:
 *           type: object
 *           description: Aggregate totals across all periods
 *           properties:
 *             totalRevenue:
 *               type: number
 *               format: float
 *               description: Total revenue across all periods
 *               example: 125000.00
 *             totalMarginAmount:
 *               type: number
 *               format: float
 *               description: Total margin amount across all periods
 *               example: 37500.00
 *             totalOrderCount:
 *               type: integer
 *               description: Total number of orders across all periods
 *               example: 45
 *     TimePeriodMetrics:
 *       type: object
 *       description: Metrics for a single time period
 *       properties:
 *         period:
 *           type: string
 *           description: Formatted period label
 *           example: "Jan 2026"
 *         periodStart:
 *           type: string
 *           format: date
 *           description: Start date of the period (ISO format)
 *           example: "2026-01-01"
 *         periodEnd:
 *           type: string
 *           format: date
 *           description: End date of the period (ISO format)
 *           example: "2026-01-31"
 *         totalRevenue:
 *           type: number
 *           format: float
 *           description: Total revenue for this period
 *           example: 25000.00
 *         totalMarginAmount:
 *           type: number
 *           format: float
 *           description: Total margin amount for this period
 *           example: 7500.00
 *         averageMarginPercent:
 *           type: number
 *           format: float
 *           description: Average margin percentage for this period
 *           example: 30.0
 *         orderCount:
 *           type: integer
 *           description: Number of orders in this period
 *           example: 10
 */

export const AnalyticsSwagger = {};
