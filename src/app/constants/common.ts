export const sortOrderType = ["asc", "desc"];
export const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const featureNames = {
    enable_inbound_requests: "enable_inbound_requests",
    show_estimate_on_order_creation: "show_estimate_on_order_creation",
    enable_kadence_invoicing: "enable_kadence_invoicing",
    enable_base_operations: "enable_base_operations",
    enable_asset_bulk_upload: "enable_asset_bulk_upload",
    enable_attachments: "enable_attachments",
    enable_workflows: "enable_workflows",
};

export const companyFeatures = {
    [featureNames.enable_inbound_requests]: true,
    [featureNames.show_estimate_on_order_creation]: true,
    [featureNames.enable_kadence_invoicing]: false,
    [featureNames.enable_base_operations]: true,
    [featureNames.enable_asset_bulk_upload]: false,
    [featureNames.enable_attachments]: true,
    [featureNames.enable_workflows]: true,
};
