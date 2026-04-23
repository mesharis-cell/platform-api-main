export type ExportOrderQuery = {
    search_term?: string;
    page?: string;
    limit?: string;
    sort_by?: string;
    sort_order?: "asc" | "desc";
    company_id?: string;
    brand_id?: string;
    order_status?: string;
    financial_status?: string;
    date_from?: string;
    date_to?: string;
};

export type ExportBaseQuery = {
    company_id?: string;
    date_from?: string;
    date_to?: string;
};

export type ExportStockQuery = ExportBaseQuery & {
    condition?: string;
    category?: string;
    status?: string;
};

export type ExportAssetUtilizationQuery = ExportBaseQuery & {
    threshold_days?: string;
    category?: string;
};

export type ExportClientIssuanceLogQuery = ExportBaseQuery & {
    // Default = post-outbound orders (READY_FOR_DELIVERY+) + post-handover SPs (PICKED_UP+).
    // Accept "all" to include every status, or omit for the default scope.
    scope?: "default" | "all";
    // Narrow to orders-only or self-pickups-only. Omit for both.
    entity_type?: "ORDER" | "SELF_PICKUP";
    // Filter by creator (musketeer). Optional.
    created_by?: string;
};

export type ExportStockMovementsQuery = {
    date_from?: string;
    date_to?: string;
    movement_type?: string;
};

export type ExportAssetCatalogQuery = {
    company_id?: string;
    brand_id?: string;
    condition?: string;
    status?: string;
    category_id?: string;
    // "true" → XLSX with embedded thumbnails (first image per asset).
    // "false" or omitted → CSV with the same columns + a Photo URL column only.
    include_photos?: string;
};
