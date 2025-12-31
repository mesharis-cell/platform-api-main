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
 *     summary: Get calendar events
 *     description: Retrieve orders as calendar events for the authenticated client user's company. Events can be filtered by month or year.
 *     parameters:
 *       - $ref: '#/components/parameters/PlatformHeader'
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
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Calendar events fetched successfully"
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
 *         description: Forbidden - Invalid company access
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
