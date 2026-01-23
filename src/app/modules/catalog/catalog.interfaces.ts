export type CatalogFilters = {
    company_id?: string; // Mapped from 'company'
    brand_id?: string; // Mapped from 'brand'
    category?: string;
    search?: string;
    type?: "asset" | "collection" | "all";
    limit?: number;
    offset?: number;
};

export type CatalogResult = {
    assets?: any[];
    collections?: any[];
    meta?: {
        total_assets?: number;
        total_collections?: number;
        page?: number;
        limit?: number;
    };
};
