import z from "zod";
import { orderItemSchema, orderSchemas } from "./order.schemas";

// Submit order payload interface
export type SubmitOrderPayload = z.infer<typeof orderSchemas.submitOrderSchema>["body"];

export type OrderItem = z.infer<typeof orderItemSchema>;

export type UpdateOrderTimeWindowsPayload = z.infer<typeof orderSchemas.updateTimeWindowsSchema>["body"];

// Email data interface for order notifications
export interface OrderSubmittedEmailData {
    orderId: string;
    companyName: string;
    eventStartDate: string;
    eventEndDate: string;
    venueCity: string;
    totalVolume: string;
    itemCount: number;
    viewOrderUrl: string;
}

// Email recipient role type
export type RecipientRole = 'PLATFORM_ADMIN' | 'LOGISTICS_STAFF' | 'CLIENT_USER';

// Progress status payload interface
export interface ProgressStatusPayload {
    new_status: string;
    notes?: string;
}

// Order pricing details interfaces
export interface OrderPricingDetails {
    order: {
        id: string;
        order_id: string;
        calculated_volume: string | null;
        venue_city: string;
        venue_country: string;
        company: {
            id: string;
            name: string;
            platform_margin_percent: string;
        };
    };
    pricing_tier: {
        id: string;
        country: string;
        city: string;
        volume_min: string;
        volume_max: string | null;
        base_price: string;
    } | null;
    standard_pricing: {
        base_price: number | null;
        pmg_margin_percent: number | null;
        pmg_margin_amount: number | null;
        final_total_price: number | null;
        tier_info: {
            country: string;
            city: string;
            volume_range: string;
        } | null;
    } | null;
    current_pricing: {
        logistics_base_price: number | null;
        logistics_adjusted_price: number | null;
        logistics_adjustment_reason: string | null;
        logistics_adjusted_at: Date | null;
        logistics_adjusted_by: {
            id: string;
            name: string;
        } | null;
        platform_margin_percent: number | null;
        platform_margin_amount: number | null;
        platform_reviewed_at: Date | null;
        platform_reviewed_by: {
            id: string;
            name: string;
        } | null;
        platform_review_notes: string | null;
        final_total_price: number | null;
        quote_sent_at: Date | null;
    };
}

export interface StandardPricing {
    pricing_tier_id: string | null;
    logistics_base_price: number | null;
    platform_margin_percent: number | null;
    platform_margin_amount: number | null;
    final_total_price: number | null;
    tier_found: boolean;
}
