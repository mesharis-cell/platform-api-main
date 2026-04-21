export interface SubmitSelfPickupPayload {
    items: Array<{
        asset_id: string;
        quantity: number;
        from_collection_id?: string;
    }>;
    brand_id?: string;
    collector_name: string;
    collector_phone: string;
    collector_email?: string;
    pickup_window: {
        start: string;
        end: string;
    };
    expected_return_at?: string;
    notes?: string;
    special_instructions?: string;
    job_number?: string;
    po_number?: string;
}

export interface SelfPickupListParams {
    page?: number;
    limit?: number;
    company?: string;
    brand?: string;
    self_pickup_status?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
}

export interface ApproveQuotePayload {
    po_number: string;
    notes?: string;
}

export interface DeclineQuotePayload {
    decline_reason: string;
}

export interface ReturnToLogisticsPayload {
    reason: string;
}
