import z from "zod";
import { LineItemsSchemas } from "./order-line-items.schemas";

export type CreateCatalogLineItemPayload = z.infer<
    typeof LineItemsSchemas.createCatalogLineItemSchema
>["body"] & {
    platform_id: string;
    added_by: string;
};

export type CreateCustomLineItemPayload = z.infer<
    typeof LineItemsSchemas.createCustomLineItemSchema
>["body"] & {
    platform_id: string;
    added_by: string;
};

export type UpdateLineItemPayload = z.infer<typeof LineItemsSchemas.updateLineItemSchema>["body"];

export type VoidLineItemPayload = z.infer<typeof LineItemsSchemas.voidLineItemSchema>["body"] & {
    voided_by: string;
};

export interface OrderLineItem {
    id: string;
    platform_id: string;
    order_id: string;
    service_type_id: string | null;
    reskin_request_id: string | null;
    line_item_type: "CATALOG" | "CUSTOM";
    category: string;
    description: string;
    quantity: string | null;
    unit: string | null;
    unit_rate: string | null;
    total: string;
    added_by: string;
    added_at: Date;
    notes: string | null;
    is_voided: boolean;
    voided_at: Date | null;
    voided_by: string | null;
    void_reason: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface LineItemsTotals {
    catalog_total: number;
    custom_total: number;
}
