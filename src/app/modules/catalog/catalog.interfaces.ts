export type CatalogFilters = {
    company_id?: string; // Mapped from 'company'
    brand_id?: string; // Mapped from 'brand'
    category?: string;
    category_id?: string;
    group_id?: string;
    team_id?: string;
    search?: string;
    search_term?: string;
    type?: "asset" | "collection" | "all";
    raw_assets?: boolean;
    limit?: number;
    offset?: number;
};

export type CatalogResult = {
    items?: any[];
    assets?: any[];
    collections?: any[];
    meta?: {
        total?: number;
        total_assets?: number;
        total_grouped_assets?: number;
        total_raw_assets?: number;
        total_collections?: number;
        page?: number;
        limit?: number;
        total_pages?: number;
    };
};
