export const sortOrderType = ["asc", "desc"];
export const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const featureNames = {
    enable_inbound_requests: "enable_inbound_requests",
    show_estimate_on_order_creation: "show_estimate_on_order_creation",
    require_client_po_number_on_quote_approval: "require_client_po_number_on_quote_approval",
    enable_kadence_invoicing: "enable_kadence_invoicing",
    enable_base_operations: "enable_base_operations",
    enable_asset_bulk_upload: "enable_asset_bulk_upload",
    enable_attachments: "enable_attachments",
    enable_workflows: "enable_workflows",
    enable_service_requests: "enable_service_requests",
    enable_event_calendar: "enable_event_calendar",
    enable_client_stock_requests: "enable_client_stock_requests",
};

export const companyFeatures = {
    [featureNames.enable_inbound_requests]: true,
    [featureNames.show_estimate_on_order_creation]: true,
    [featureNames.require_client_po_number_on_quote_approval]: true,
    [featureNames.enable_kadence_invoicing]: false,
    [featureNames.enable_base_operations]: true,
    [featureNames.enable_asset_bulk_upload]: false,
    [featureNames.enable_attachments]: true,
    [featureNames.enable_workflows]: true,
    [featureNames.enable_service_requests]: true,
    [featureNames.enable_event_calendar]: true,
    [featureNames.enable_client_stock_requests]: true,
};
