import z from "zod";
import { ReskinRequestsSchemas } from "./reskin-requests.schemas";

export type ProcessReskinRequestPayload = z.infer<
    typeof ReskinRequestsSchemas.processReskinRequestSchema
>["body"] & {
    platform_id: string;
    order_id: string;
    order_item_id: string;
    added_by: string;
};

export type CompleteReskinRequestPayload = z.infer<
    typeof ReskinRequestsSchemas.completeReskinRequestSchema
>["body"] & {
    completed_by: string;
};

export type CancelReskinRequestPayload = z.infer<
    typeof ReskinRequestsSchemas.cancelReskinRequestSchema
>["body"] & {
    cancelled_by: string;
};

export interface ReskinRequest {
    id: string;
    platform_id: string;
    order_id: string;
    order_item_id: string;
    original_asset_id: string;
    original_asset_name: string;
    target_brand_id: string | null;
    target_brand_custom: string | null;
    client_notes: string;
    admin_notes: string | null;
    new_asset_id: string | null;
    new_asset_name: string | null;
    completed_at: Date | null;
    completed_by: string | null;
    completion_notes: string | null;
    completion_photos: string[];
    cancelled_at: Date | null;
    cancelled_by: string | null;
    cancellation_reason: string | null;
    created_at: Date;
    updated_at: Date;
}

export type ReskinStatus = "pending" | "complete" | "cancelled";
