import z from "zod";
import { orderItemSchema, orderSchemas } from "./order.schemas";

export type CalculateEstimatePayload = z.infer<typeof orderSchemas.calculateEstimateSchema>["body"];

// Submit order payload interface
export type SubmitOrderPayload = z.infer<typeof orderSchemas.submitOrderSchema>["body"];

export type OrderItemPayload = z.infer<typeof orderItemSchema>;

export type UpdateOrderTimeWindowsPayload = z.infer<
    typeof orderSchemas.updateTimeWindowsSchema
>["body"];

export type AdjustLogisticsPricingPayload = z.infer<
    typeof orderSchemas.adjustLogisticsPricingSchema
>["body"];

export type ApproveStandardPricingPayload = z.infer<
    typeof orderSchemas.approveStandardPricingSchema
>["body"];

export type ApprovePlatformPricingPayload = z.infer<
    typeof orderSchemas.approvePlatformPricingSchema
>["body"];

export type ApproveQuotePayload = z.infer<typeof orderSchemas.approveQuoteSchema>["body"];

export type DeclineQuotePayload = z.infer<typeof orderSchemas.declineQuoteSchema>["body"];

export type AdminApproveQuotePayload = z.infer<typeof orderSchemas.adminApproveQuoteSchema>["body"];

export type UpdateVehiclePayload = z.infer<typeof orderSchemas.updateVehicleSchema>["body"]

export interface CancelOrderPayload {
    reason:
    | "client_requested"
    | "asset_unavailable"
    | "pricing_dispute"
    | "event_cancelled"
    | "fabrication_failed"
    | "other";
    notes: string;
    notify_client: boolean;
}

export type OrderItem = {
    platform_id: string;
    asset_id: string;
    asset_name: string;
    quantity: number;
    volume_per_unit: string;
    weight_per_unit: string;
    total_volume: string;
    total_weight: string;
    condition_notes: string | null;
    handling_tags: string[];
    from_collection: string | null;
    from_collection_name: string | null;
    // NEW: Reskin fields
    is_reskin_request?: boolean;
    reskin_target_brand_id?: string | null;
    reskin_target_brand_custom?: string | null;
    reskin_notes?: string | null;
};

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
        venue_location: any;
        transport_trip_type: string;
        transport_vehicle_type: string;
        company: {
            id: string;
            name: string;
            platform_margin_percent: string;
        };
    };
    pricing: any;
    line_items: any[];
    reskin_requests: any[];
}

export interface StandardPricing {
    pricing_tier_id: string | null;
    logistics_base_price: number | null;
    platform_margin_percent: number | null;
    platform_margin_amount: number | null;
    final_total_price: number | null;
    tier_found: boolean;
}
