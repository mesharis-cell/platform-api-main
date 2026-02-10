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
