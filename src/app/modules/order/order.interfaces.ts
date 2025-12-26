import z from "zod";
import { orderItemSchema, orderSchemas } from "./order.schemas";

// Submit order payload interface
export type SubmitOrderPayload = z.infer<typeof orderSchemas.submitOrderSchema>["body"];

export type OrderItem = z.infer<typeof orderItemSchema>;

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
