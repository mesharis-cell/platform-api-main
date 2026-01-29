export const PERMISSIONS = {
    // ==================== AUTHENTICATION ====================
    AUTH_LOGIN: "auth:login", // ✅
    AUTH_RESET_PASSWORD: "auth:reset_password", // ✅
    AUTH_ALL: "auth:*",

    // ==================== USER MANAGEMENT ====================
    USERS_CREATE: "users:create", // ✅
    USERS_READ: "users:read", // ✅
    USERS_ALL: "users:*",
    USERS_UPDATE: "users:update", // ✅
    USERS_DEACTIVATE: "users:deactivate", // ✅

    // ==================== COMPANY MANAGEMENT ====================
    COMPANIES_CREATE: "companies:create", // ✅
    COMPANIES_READ: "companies:read", // ✅
    COMPANIES_UPDATE: "companies:update", // ✅
    COMPANIES_ARCHIVE: "companies:archive", // ✅
    COMPANIES_SET_MARGIN: "companies:set_margin", // ✅
    COMPANIES_ALL: "companies:*",

    // ==================== WAREHOUSE MANAGEMENT ====================
    WAREHOUSES_CREATE: "warehouses:create", // ✅
    WAREHOUSES_READ: "warehouses:read", // ✅
    WAREHOUSES_UPDATE: "warehouses:update", // ✅
    WAREHOUSES_ARCHIVE: "warehouses:archive", // ✅
    WAREHOUSES_ALL: "warehouses:*",

    // ==================== ZONE MANAGEMENT ====================
    ZONES_CREATE: "zones:create", // ✅
    ZONES_READ: "zones:read", // ✅
    ZONES_UPDATE: "zones:update", // ✅
    ZONES_DELETE: "zones:delete", // ✅
    ZONES_ASSIGN_COMPANY: "zones:assign_company", // ✅
    ZONES_ALL: "zones:*",

    // ==================== BRAND MANAGEMENT ====================
    BRANDS_CREATE: "brands:create", // ✅
    BRANDS_READ: "brands:read", // ✅
    BRANDS_UPDATE: "brands:update", // ✅
    BRANDS_DELETE: "brands:delete", // ✅
    BRANDS_ALL: "brands:*",

    // ==================== COUNTRY MANAGEMENT ====================
    COUNTRIES_CREATE: "countries:create", // ✅
    COUNTRIES_READ: "countries:read", // ✅
    COUNTRIES_UPDATE: "countries:update", // ✅
    COUNTRIES_DELETE: "countries:delete", // ✅
    COUNTRIES_ALL: "countries:*",

    // ==================== ASSET MANAGEMENT ====================
    ASSETS_CREATE: "assets:create", // ✅
    ASSETS_READ: "assets:read", // ✅
    ASSETS_UPDATE: "assets:update", // ✅
    ASSETS_DELETE: "assets:delete", // ✅
    ASSETS_GENERATE_QR: "assets:generate_qr", // ✅
    ASSETS_UPLOAD_PHOTOS: "assets:upload_photos",
    ASSETS_ALL: "assets:*",

    // ==================== COLLECTION MANAGEMENT ====================
    COLLECTIONS_CREATE: "collections:create", // ✅
    COLLECTIONS_READ: "collections:read", // ✅
    COLLECTIONS_UPDATE: "collections:update", // ✅
    COLLECTIONS_DELETE: "collections:delete", // ✅
    COLLECTIONS_ASSIGN_ASSETS: "collections:assign_assets", // ✅
    COLLECTIONS_ALL: "collections:*",

    // ==================== PRICING CONFIGURATION (DEPRECATED) ====================
    PRICING_TIERS_CREATE: "pricing_tiers:create", // ✅ DEPRECATED
    PRICING_TIERS_READ: "pricing_tiers:read", // ✅ DEPRECATED
    PRICING_TIERS_UPDATE: "pricing_tiers:update", // ✅ DEPRECATED
    PRICING_TIERS_ACTIVATE: "pricing_tiers:activate", // ✅ DEPRECATED
    PRICING_TIERS_DEACTIVATE: "pricing_tiers:deactivate", // ✅ DEPRECATED
    PRICING_TIERS_ALL: "pricing_tiers:*", // DEPRECATED

    // ==================== PRICING CONFIGURATION (NEW) ====================
    PRICING_CONFIG_READ: "pricing_config:read",
    PRICING_CONFIG_UPDATE: "pricing_config:update",
    TRANSPORT_RATES_MANAGE: "transport_rates:manage",
    SERVICE_TYPES_MANAGE: "service_types:manage",
    ORDER_LINE_ITEMS_MANAGE: "order_line_items:manage",

    // ==================== PRICING REVIEW ====================
    PRICING_REVIEW: "pricing:review", // ✅
    PRICING_APPROVE_STANDARD: "pricing:approve_standard", // ✅ DEPRECATED (all go through admin now)
    PRICING_ADJUST: "pricing:adjust", // ✅
    PRICING_ADMIN_REVIEW_ADJUSTMENT: "pricing:admin_review_adjustment", // ✅
    PRICING_ADMIN_APPROVE: "pricing:admin_approve", // ✅
    PRICING_ALL: "pricing:*",

    // ==================== RESKIN/REBRAND WORKFLOW ====================
    RESKIN_REQUESTS_PROCESS: "reskin_requests:process",
    RESKIN_REQUESTS_COMPLETE: "reskin_requests:complete",
    RESKIN_REQUESTS_CANCEL: "reskin_requests:cancel",

    // ==================== ORDER MANAGEMENT ====================
    ORDERS_CREATE: "orders:create", // ✅
    ORDERS_READ: "orders:read", // ✅
    ORDERS_UPDATE: "orders:update",
    ORDERS_ADD_JOB_NUMBER: "orders:add_job_number", // ✅
    ORDERS_ADD_TIME_WINDOWS: "orders:add_time_windows", // ✅
    ORDERS_VIEW_STATUS_HISTORY: "orders:view_status_history", // ✅
    ORDERS_EXPORT: "orders:export", // ✅
    ORDERS_CANCEL: "orders:cancel",
    ORDERS_ALL: "orders:*",

    // ==================== QUOTES ====================
    QUOTES_APPROVE: "quotes:approve", // ✅
    QUOTES_DECLINE: "quotes:decline", // ✅
    QUOTES_ALL: "quotes:*",

    // ==================== INVOICING ====================
    INVOICES_GENERATE: "invoices:generate", // ✅
    INVOICES_READ: "invoices:read", // ✅
    INVOICES_DOWNLOAD: "invoices:download", // TODO: Need to use another method
    INVOICES_CONFIRM_PAYMENT: "invoices:confirm_payment", // ✅
    INVOICES_TRACK_PAYMENT_STATUS: "invoices:track_payment_status",
    INVOICES_ALL: "invoices:*",

    // ==================== QR SCANNING ====================
    SCANNING_SCAN_OUT: "scanning:scan_out", // ✅
    SCANNING_SCAN_IN: "scanning:scan_in", // ✅
    SCANNING_CAPTURE_TRUCK_PHOTOS: "scanning:capture_truck_photos",
    SCANNING_ALL: "scanning:*",

    // ==================== INVENTORY TRACKING ====================
    INVENTORY_MONITOR_AVAILABILITY: "inventory:monitor_availability",
    INVENTORY_TRACK_STATUS: "inventory:track_status",
    INVENTORY_UPDATE_QUANTITIES: "inventory:update_quantities",
    INVENTORY_ALL: "inventory:*",

    // ==================== CONDITION MANAGEMENT ====================
    CONDITIONS_UPDATE: "conditions:update", // ✅
    CONDITIONS_VIEW_HISTORY: "conditions:view_history", // ✅
    CONDITIONS_VIEW_ITEMS_NEEDING_ATTENTION: "conditions:view_items_needing_attention", // ✅
    CONDITIONS_COMPLETE_MAINTENANCE: "conditions:complete_maintenance", // ✅
    CONDITIONS_ALL: "conditions:*",

    // ==================== LIFECYCLE & NOTIFICATIONS ====================
    LIFECYCLE_PROGRESS_STATUS: "lifecycle:progress_status",
    LIFECYCLE_RECEIVE_NOTIFICATIONS: "lifecycle:receive_notifications",
    NOTIFICATIONS_VIEW_FAILED: "notifications:view_failed",
    NOTIFICATIONS_RETRY: "notifications:retry",
    LIFECYCLE_ALL: "lifecycle:*",
    NOTIFICATIONS_ALL: "notifications:*",

    // ==================== ANALYTICS ====================
    ANALYTICS_VIEW_REVENUE: "analytics:view_revenue", // ✅
    ANALYTICS_TRACK_MARGIN: "analytics:track_margin", // ✅
    ANALYTICS_FILTER_BY_COMPANY: "analytics:filter_by_company", // ✅
    ANALYTICS_ALL: "analytics:*",
};

export const PERMISSION_TEMPLATES = {
    PLATFORM_ADMIN: [
        PERMISSIONS.AUTH_ALL,
        PERMISSIONS.USERS_ALL,
        PERMISSIONS.COMPANIES_ALL,
        PERMISSIONS.BRANDS_ALL,
        PERMISSIONS.COUNTRIES_ALL,
        PERMISSIONS.WAREHOUSES_ALL,
        PERMISSIONS.ZONES_ALL,
        PERMISSIONS.ASSETS_ALL,
        PERMISSIONS.COLLECTIONS_ALL,
        PERMISSIONS.PRICING_TIERS_ALL,
        PERMISSIONS.PRICING_ALL,
        PERMISSIONS.ORDERS_ALL,
        PERMISSIONS.INVOICES_ALL,
        PERMISSIONS.SCANNING_ALL,
        PERMISSIONS.INVENTORY_ALL,
        PERMISSIONS.CONDITIONS_ALL,
        PERMISSIONS.LIFECYCLE_ALL,
        PERMISSIONS.NOTIFICATIONS_ALL,
        PERMISSIONS.ANALYTICS_ALL,
    ],
    LOGISTICS_STAFF: [
        PERMISSIONS.AUTH_LOGIN,
        PERMISSIONS.AUTH_RESET_PASSWORD,
        PERMISSIONS.USERS_READ,
        PERMISSIONS.COMPANIES_READ,
        PERMISSIONS.BRANDS_READ,
        PERMISSIONS.COUNTRIES_READ,
        PERMISSIONS.WAREHOUSES_READ,
        PERMISSIONS.ZONES_READ,
        PERMISSIONS.ZONES_CREATE,
        PERMISSIONS.ASSETS_ALL,
        PERMISSIONS.COLLECTIONS_ALL,
        PERMISSIONS.ORDERS_READ,
        PERMISSIONS.ORDERS_UPDATE,
        PERMISSIONS.ORDERS_ADD_JOB_NUMBER,
        PERMISSIONS.ORDERS_ADD_TIME_WINDOWS,
        PERMISSIONS.ORDERS_VIEW_STATUS_HISTORY,
        PERMISSIONS.ORDERS_EXPORT,
        PERMISSIONS.PRICING_REVIEW,
        PERMISSIONS.PRICING_APPROVE_STANDARD,
        PERMISSIONS.PRICING_ADJUST,
        PERMISSIONS.SCANNING_ALL,
        PERMISSIONS.INVENTORY_ALL,
        PERMISSIONS.CONDITIONS_ALL,
        PERMISSIONS.LIFECYCLE_PROGRESS_STATUS,
        PERMISSIONS.LIFECYCLE_RECEIVE_NOTIFICATIONS,
    ],
    CLIENT_USER: [
        PERMISSIONS.AUTH_LOGIN,
        PERMISSIONS.AUTH_RESET_PASSWORD,
        PERMISSIONS.COMPANIES_READ,
        PERMISSIONS.BRANDS_READ,
        PERMISSIONS.COUNTRIES_READ,
        PERMISSIONS.ASSETS_READ,
        PERMISSIONS.COLLECTIONS_READ,
        PERMISSIONS.ORDERS_CREATE,
        PERMISSIONS.ORDERS_READ,
        PERMISSIONS.ORDERS_UPDATE,
        PERMISSIONS.ORDERS_VIEW_STATUS_HISTORY,
        PERMISSIONS.QUOTES_APPROVE,
        PERMISSIONS.QUOTES_DECLINE,
        PERMISSIONS.INVOICES_READ,
        PERMISSIONS.INVOICES_DOWNLOAD,
        PERMISSIONS.LIFECYCLE_RECEIVE_NOTIFICATIONS,
    ],
};

// Type for all permission values
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Helper to get all permission values as an array
export const getAllPermissions = (): Permission[] => {
    return Object.values(PERMISSIONS);
};

// Helper to check if a string is a valid permission
export const isValidPermission = (permission: string): permission is Permission => {
    return getAllPermissions().includes(permission as Permission);
};
