/**
 * @swagger
 * tags:
 *   - name: Calendar
 *     description: Client Calendar Events (Orders displayed as calendar events)
 */

/**
 * @swagger
 * /api/client/v1/calendar:
 *   get:
 *     tags:
 *       - Calendar
 *     summary: Get calendar events with pagination
 *     description: |
 *       Retrieve orders as calendar events with pagination support.
 *       
 *       **Access Control:**
 *       - ADMIN and LOGISTICS users can view all calendar events across all companies
 *       - CLIENT users can only view events for their own company
 *       
 *       **Filtering:**
 *       Events can be filtered by month or year. If both are provided, month takes precedence.
 *       If neither is provided, returns all events (paginated).
 *       
 *       **Pagination:**
 *       Results are paginated with default limit of 10 items per page.
 *       Events are sorted by event_start_date in ascending order.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
 *       - name: page
 *         in: query
 *         description: Page number for pagination (starts from 1)
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *           example: 1
 *       - name: limit
 *         in: query
 *         description: Number of items per page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *           example: 10
 *       - name: month
 *         in: query
 *         description: Filter by month in YYYY-MM format (e.g., "2024-12"). Takes precedence over year if both are provided.
 *         required: false
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-(0[1-9]|1[0-2])$'
 *           example: "2024-12"
 *       - name: year
 *         in: query
 *         description: Filter by year in YYYY format (e.g., "2024"). Ignored if month is provided.
 *         required: false
 *         schema:
 *           type: string
 *           pattern: '^\d{4}$'
 *           example: "2024"
 *     responses:
 *       200:
 *         description: Calendar events retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Calendar events fetched successfully"
 *                 meta:
 *                   type: object
 *                   description: Pagination metadata
 *                   properties:
 *                     page:
 *                       type: integer
 *                       description: Current page number
 *                       example: 1
 *                     limit:
 *                       type: integer
 *                       description: Number of items per page
 *                       example: 10
 *                     total:
 *                       type: integer
 *                       description: Total number of events matching the filters
 *                       example: 45
 *                 data:
 *                   type: array
 *                   description: List of calendar events (orders)
 *                   items:
 *                     $ref: '#/components/schemas/CalendarEvent'
 *       401:
 *         description: Unauthorized - Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - CLIENT user without company access
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
 *                   example: "Company not found"
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
 *     CalendarEvent:
 *       type: object
 *       description: A calendar event representing an order
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique identifier of the order
 *           example: "550e8400-e29b-41d4-a716-446655440000"
 *         order_id:
 *           type: string
 *           description: Human-readable order ID
 *           example: "ORD-20241231-001"
 *         title:
 *           type: string
 *           description: Event title (generated from venue name)
 *           example: "Grand Ballroom Event"
 *         event_start_date:
 *           type: string
 *           format: date-time
 *           description: Start date of the event
 *           example: "2024-12-31T00:00:00.000Z"
 *         event_end_date:
 *           type: string
 *           format: date-time
 *           description: End date of the event
 *           example: "2025-01-02T00:00:00.000Z"
 *         venue_name:
 *           type: string
 *           description: Name of the venue
 *           example: "Grand Ballroom"
 *         venue_city:
 *           type: string
 *           nullable: true
 *           description: City where the venue is located
 *           example: "Dubai"
 *         status:
 *           type: string
 *           description: Current order status
 *           enum:
 *             - DRAFT
 *             - SUBMITTED
 *             - PRICING_REVIEW
 *             - PENDING_APPROVAL
 *             - QUOTED
 *             - DECLINED
 *             - CONFIRMED
 *             - IN_PREPARATION
 *             - READY_FOR_DELIVERY
 *             - IN_TRANSIT
 *             - DELIVERED
 *             - IN_USE
 *             - AWAITING_RETURN
 *             - CLOSED
 *           example: "CONFIRMED"
 *         company:
 *           type: object
 *           nullable: true
 *           description: Company associated with the order
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *               description: Company unique identifier
 *               example: "770e8400-e29b-41d4-a716-446655440002"
 *             name:
 *               type: string
 *               description: Company name
 *               example: "Diageo"
 *         brand:
 *           type: object
 *           nullable: true
 *           description: Brand associated with the order
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *               description: Brand unique identifier
 *               example: "660e8400-e29b-41d4-a716-446655440001"
 *             name:
 *               type: string
 *               description: Brand name
 *               example: "Johnnie Walker"
 */

export const CalendarSwagger = {};
