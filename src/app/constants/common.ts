export const sortOrderType = ["asc", "desc"];
export const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const featureNames = {
    enable_inbound_requests: "enable_inbound_requests",
    show_estimate_on_order_creation: "show_estimate_on_order_creation",
    enable_kadence_invoicing: "enable_kadence_invoicing",
};

export const companyFeatures = {
    [featureNames.enable_inbound_requests]: true,
    [featureNames.show_estimate_on_order_creation]: true,
    [featureNames.enable_kadence_invoicing]: false,
};
