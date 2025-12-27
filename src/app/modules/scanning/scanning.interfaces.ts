export interface InboundScanPayload {
    qr_code: string;
    condition: 'GREEN' | 'ORANGE' | 'RED';
    notes?: string;
    photos?: string[];
    refurb_days_estimate?: number;
    discrepancy_reason?: 'BROKEN' | 'LOST' | 'OTHER';
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
    progress: ScanProgressResponse;
}

export interface AssetProgress {
    asset_id: string;
    asset_name: string;
    qr_code: string;
    tracking_method: 'INDIVIDUAL' | 'BATCH';
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
