export interface DamageReportEntryPayload {
    url: string;
    note?: string;
}

export interface ScanMediaPayload {
    url: string;
    note?: string;
}

export interface InboundScanPayload {
    qr_code: string;
    condition: "GREEN" | "ORANGE" | "RED";
    notes?: string;
    return_media: ScanMediaPayload[];
    damage_media?: DamageReportEntryPayload[];
    refurb_days_estimate?: number;
    discrepancy_reason?: "BROKEN" | "LOST" | "OTHER";
    quantity?: number; // For BATCH assets
}

export interface ScanProgressResponse {
    items_scanned: number;
    total_items: number;
    percent_complete: number;
}

export interface InboundScanResponse {
    message: string;
    asset: any;
    progress?: ScanProgressResponse;
    redirect_asset?: {
        id: string;
        name: string;
        qr_code: string;
    };
}

export interface AssetProgress {
    asset_id: string;
    asset_name: string;
    qr_code: string;
    tracking_method: "INDIVIDUAL" | "BATCH";
    required_quantity: number;
    scanned_quantity: number;
    is_complete: boolean;
}

export interface OrderProgressResponse {
    order_id: string;
    order_status: string;
    total_items: number;
    items_scanned: number;
    percent_complete: number;
    assets: AssetProgress[];
}

export interface PooledSettlementEntry {
    line_id: string; // order_items.id or self_pickup_items.id
    returned_quantity: number;
    reason:
        | "POOLED_SETTLEMENT_CONSUMED"
        | "POOLED_SETTLEMENT_LOST"
        | "POOLED_SETTLEMENT_DAMAGED"
        | "POOLED_SETTLEMENT_OTHER";
    note?: string;
}

export interface UnsettledPooledLine {
    line_id: string;
    asset_id: string;
    asset_name: string;
    outbound_qty: number;
    scanned_qty: number;
    delta: number;
}

export interface CompleteInboundScanResponse {
    message: string;
    order_id: string;
    new_status: string;
    requires_settlement?: UnsettledPooledLine[];
}

// ====================== OUTBOUND SCANNING INTERFACES ======================

export interface OutboundScanPayload {
    qr_code: string;
    note?: string;
    quantity?: number; // Required for BATCH assets
}

export interface OutboundScanResponse {
    success: boolean;
    asset: {
        asset_id: string;
        asset_name: string;
        tracking_method: "INDIVIDUAL" | "BATCH";
        scanned_quantity: number;
        required_quantity: number;
        remaining_quantity: number;
    };
    progress?: {
        total_items: number;
        items_scanned: number;
        percent_complete: number;
    };
    redirect_asset?: {
        id: string;
        name: string;
        qr_code: string;
    };
}

export interface CompleteOutboundScanResponse {
    message: string;
    order_id: string;
    new_status: string;
}
