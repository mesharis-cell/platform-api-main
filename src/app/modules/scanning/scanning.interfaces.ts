export interface InboundScanPayload {
    qr_code: string;
    condition: "GREEN" | "ORANGE" | "RED";
    notes?: string;
    photos?: string[];
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

export interface CompleteInboundScanResponse {
    message: string;
    order_id: string;
    new_status: string;
}

// ====================== OUTBOUND SCANNING INTERFACES ======================

export interface OutboundScanPayload {
    qr_code: string;
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
