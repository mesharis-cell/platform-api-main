export const sortOrderType = ["asc", "desc"];
export const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Platform feature-flag registry. Single source of truth for the whole stack.
 *
 * Adding a new flag? ONLY touch this object. Everything downstream derives
 * from it automatically:
 * - `featureNames` + `companyFeatures` exports below (preserved for existing
 *   callers)
 * - Platform + auth Zod schemas + sanitizers (iterate Object.keys(featureRegistry))
 * - Company override sanitizer
 * - featureValidator middleware (takes key as a param)
 * - Admin + warehouse UIs: served via /auth/context as `feature_registry` —
 *   the frontends render toggle labels + descriptions from here, so adding
 *   a flag ships to the UI with zero frontend changes required
 *
 * Never hand-code a feature key list in any schema, sanitizer, or UI. See
 * CLAUDE.md <feature_flag_discipline> for the rationale and derivation
 * patterns already wired up.
 */
export const featureRegistry = {
    enable_inbound_requests: {
        default: true,
        label: "Enable Inbound Requests",
        description: "Allow inbound request workflows",
    },
    show_estimate_on_order_creation: {
        default: true,
        label: "Show Estimate on Order Creation",
        description: "Display estimate immediately in order creation flow",
    },
    require_client_po_number_on_quote_approval: {
        default: true,
        label: "Require PO Number on Quote Approval",
        description: "Require a client PO number when approving a quote",
    },
    enable_kadence_invoicing: {
        default: false,
        label: "Enable Invoicing",
        description: "Enable invoice generation and payment confirmation flows",
        comingSoon: true,
    },
    enable_base_operations: {
        default: true,
        label: "Enable Picking & Handling",
        description: "Include Picking & Handling (base operations) in pricing calculations",
    },
    enable_asset_bulk_upload: {
        default: false,
        label: "Enable Asset Bulk Upload",
        description: "Allow bulk uploading of assets via spreadsheet import",
    },
    enable_attachments: {
        default: true,
        label: "Enable Attachments",
        description:
            "Allow typed documents across order, inbound, service request, and workflow records",
    },
    enable_workflows: {
        default: true,
        label: "Enable Internal Workflows",
        description: "Expose workflow sections, workflow inboxes, and workflow request creation",
    },
    enable_service_requests: {
        default: true,
        label: "Enable Service Requests",
        description: "Show service requests section in client portal",
    },
    enable_event_calendar: {
        default: true,
        label: "Enable Event Calendar",
        description: "Show event calendar page in client portal",
    },
    enable_client_stock_requests: {
        default: true,
        label: "Enable Client Stock Requests",
        description: "Allow clients to submit new stock / inbound requests",
    },
    enable_self_pickup: {
        default: false,
        label: "Enable Self Pickup",
        description:
            "Allow clients to choose self-pickup at checkout. Adds a separate commercial flow with collector details, pickup window, and warehouse handover scanning.",
    },
} as const;

type FeatureKey = keyof typeof featureRegistry;

/**
 * Derived: string-indexed name map preserving the `featureNames.enable_X`
 * access pattern used across the codebase.
 */
export const featureNames = (Object.keys(featureRegistry) as FeatureKey[]).reduce(
    (acc, key) => {
        acc[key] = key;
        return acc;
    },
    {} as { [K in FeatureKey]: K }
);

/**
 * Derived: flat { [key]: default_value } map used by sanitizers + default
 * resolvers. Preserved export so existing code continues working.
 */
export const companyFeatures = (Object.keys(featureRegistry) as FeatureKey[]).reduce(
    (acc, key) => {
        acc[key] = featureRegistry[key].default;
        return acc;
    },
    {} as { [K in FeatureKey]: boolean }
);
