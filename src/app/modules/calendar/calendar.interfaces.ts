/**
 * Interface for a single calendar event
 */
export interface CalendarEvent {
  id: string;
  order_id: string;
  title: string;
  event_start_date: Date | null;
  event_end_date: Date | null;
  venue_name: string;
  venue_city: string | null;
  status: string;
  brand: {
    id: string;
    name: string;
  } | null;
}

/**
 * Interface for calendar query parameters
 */
export interface CalendarQueryParams {
  month?: string; // Format: YYYY-MM
  year?: string;  // Format: YYYY
}
