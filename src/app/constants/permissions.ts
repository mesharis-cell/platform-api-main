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
    USERS_MANAGE_PASSWORD: "users:manage_password",

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

    // ==================== CITY MANAGEMENT ====================
    CITIES_CREATE: "cities:create",
    CITIES_READ: "cities:read",
    CITIES_UPDATE: "cities:update",
    CITIES_DELETE: "cities:delete",
    CITIES_ALL: "cities:*",

    // ==================== ASSET MANAGEMENT ====================
    ASSETS_CREATE: "assets:create", // ✅
    ASSETS_READ: "assets:read", // ✅
    ASSETS_UPDATE: "assets:update", // ✅
    ASSETS_DELETE: "assets:delete", // ✅
    ASSETS_GENERATE_QR: "assets:generate_qr", // ✅
    ASSETS_UPLOAD_PHOTOS: "assets:upload_photos",
    ASSETS_BULK_UPLOAD: "assets:bulk_upload", // ✅
    ASSETS_CHECK_AVAILABILITY: "assets:check_availability", // ✅
    ASSETS_AVAILABILITY_STATS: "assets:availability_stats", // ✅
    ASSETS_SCAN_HISTORY: "assets:scan_history", // ✅
    ASSETS_ALL: "assets:*",

    // ==================== CALENDAR ============================
    CALENDAR_READ: "calendar:read",
    CALENDAR_ALL: "calendar:*",

    // ==================== COLLECTION MANAGEMENT ====================
    COLLECTIONS_CREATE: "collections:create", // ✅
    COLLECTIONS_READ: "collections:read", // ✅
    COLLECTIONS_UPDATE: "collections:update", // ✅
    COLLECTIONS_DELETE: "collections:delete", // ✅
    COLLECTIONS_ASSIGN_ASSETS: "collections:assign_assets", // ✅
    COLLECTIONS_ALL: "collections:*",

    // ==================== TEAM MANAGEMENT ====================
    TEAMS_CREATE: "teams:create",
    TEAMS_READ: "teams:read",
    TEAMS_UPDATE: "teams:update",
    TEAMS_DELETE: "teams:delete",
    TEAMS_MANAGE_MEMBERS: "teams:manage_members",
    TEAMS_ALL: "teams:*",

    // ==================== SERVICE REQUESTS ====================
    SERVICE_REQUESTS_CREATE: "service_requests:create",
    SERVICE_REQUESTS_READ: "service_requests:read",
    SERVICE_REQUESTS_UPDATE: "service_requests:update",
    SERVICE_REQUESTS_ALL: "service_requests:*",

    // ==================== INBOUND REQUESTS ====================
    INBOUND_REQUESTS_CREATE: "inbound_requests:create",
    INBOUND_REQUESTS_READ: "inbound_requests:read",
    INBOUND_REQUESTS_UPDATE: "inbound_requests:update",
    INBOUND_REQUESTS_ALL: "inbound_requests:*",

    // ==================== LINE ITEM REQUESTS ====================
    LINE_ITEM_REQUESTS_CREATE: "line_item_requests:create",
    LINE_ITEM_REQUESTS_READ: "line_item_requests:read",
    LINE_ITEM_REQUESTS_REVIEW: "line_item_requests:review",
    LINE_ITEM_REQUESTS_ALL: "line_item_requests:*",

    // ==================== WORKFLOW INBOX / DEFINITIONS ====================
    WORKFLOW_REQUESTS_READ: "workflow_requests:read",
    WORKFLOW_REQUESTS_UPDATE: "workflow_requests:update",
    WORKFLOW_REQUESTS_ALL: "workflow_requests:*",
    WORKFLOW_DEFINITIONS_READ: "workflow_definitions:read",
    WORKFLOW_DEFINITIONS_UPDATE: "workflow_definitions:update",
    WORKFLOW_DEFINITIONS_ALL: "workflow_definitions:*",

    // ==================== SETTINGS CONTROL PLANE ====================
    PLATFORM_SETTINGS_READ: "platform_settings:read",
    PLATFORM_SETTINGS_UPDATE: "platform_settings:update",
    PLATFORM_SETTINGS_ALL: "platform_settings:*",
    NOTIFICATION_RULES_READ: "notification_rules:read",
    NOTIFICATION_RULES_UPDATE: "notification_rules:update",
    NOTIFICATION_RULES_ALL: "notification_rules:*",
    ATTACHMENT_TYPES_READ: "attachment_types:read",
    ATTACHMENT_TYPES_UPDATE: "attachment_types:update",
    ATTACHMENT_TYPES_ALL: "attachment_types:*",
    ACCESS_POLICIES_READ: "access_policies:read",
    ACCESS_POLICIES_UPDATE: "access_policies:update",
    ACCESS_POLICIES_ALL: "access_policies:*",
    WAREHOUSE_OPS_RATES_READ: "warehouse_ops_rates:read",
    WAREHOUSE_OPS_RATES_UPDATE: "warehouse_ops_rates:update",
    WAREHOUSE_OPS_RATES_ALL: "warehouse_ops_rates:*",

    // ==================== PAGE VISIBILITY ====================
    ANALYTICS_VIEW_PAGE: "analytics:view_page",
    ANALYTICS_VIEW_REPORTS_PAGE: "analytics:view_reports_page",
    ORDERS_VIEW_PAGE: "orders:view_page",
    ORDERS_VIEW_PENDING_APPROVAL_PAGE: "orders:view_pending_approval_page",
    SERVICE_REQUESTS_VIEW_PAGE: "service_requests:view_page",
    WORKFLOW_REQUESTS_VIEW_PAGE: "workflow_requests:view_page",
    LINE_ITEM_REQUESTS_VIEW_PAGE: "line_item_requests:view_page",
    SELF_BOOKINGS_VIEW_PAGE: "self_bookings:view_page",
    CALENDAR_VIEW_PAGE: "calendar:view_page",
    INVOICES_VIEW_PAGE: "invoices:view_page",
    ASSETS_VIEW_PAGE: "assets:view_page",
    COLLECTIONS_VIEW_PAGE: "collections:view_page",
    INBOUND_REQUESTS_VIEW_PAGE: "inbound_requests:view_page",
    CONDITIONS_VIEW_PAGE: "conditions:view_page",
    WAREHOUSES_VIEW_PAGE: "warehouses:view_page",
    ZONES_VIEW_PAGE: "zones:view_page",
    USERS_VIEW_PAGE: "users:view_page",
    COMPANIES_VIEW_PAGE: "companies:view_page",
    BRANDS_VIEW_PAGE: "brands:view_page",
    TEAMS_VIEW_PAGE: "teams:view_page",
    PLATFORM_SETTINGS_VIEW_PAGE: "platform_settings:view_page",
    NOTIFICATION_RULES_VIEW_PAGE: "notification_rules:view_page",
    ATTACHMENT_TYPES_VIEW_PAGE: "attachment_types:view_page",
    WORKFLOW_DEFINITIONS_VIEW_PAGE: "workflow_definitions:view_page",
    ACCESS_POLICIES_VIEW_PAGE: "access_policies:view_page",
    SERVICE_TYPES_VIEW_PAGE: "service_types:view_page",
    WAREHOUSE_OPS_RATES_VIEW_PAGE: "warehouse_ops_rates:view_page",
    COUNTRIES_VIEW_PAGE: "countries:view_page",
    CITIES_VIEW_PAGE: "cities:view_page",

    // ==================== PRICING SUPPORT ====================
    TRANSPORT_RATES_MANAGE: "transport_rates:manage",
    SERVICE_TYPES_MANAGE: "service_types:manage",
    SERVICE_TYPES_ALL: "service_types:*",
    ORDER_LINE_ITEMS_MANAGE: "order_line_items:manage",

    // ==================== PRICING REVIEW ====================
    PRICING_REVIEW: "pricing:review", // ✅
    PRICING_ADJUST: "pricing:adjust", // ✅
    PRICING_ADMIN_REVIEW_ADJUSTMENT: "pricing:admin_review_adjustment", // ✅
    PRICING_ADMIN_APPROVE: "pricing:admin_approve", // ✅
    PRICING_ALL: "pricing:*",

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

    // ==================== SELF BOOKINGS ====================
    SELF_BOOKINGS_CREATE: "self_bookings:create",
    SELF_BOOKINGS_READ: "self_bookings:read",
    SELF_BOOKINGS_RETURN: "self_bookings:return",
    SELF_BOOKINGS_CANCEL: "self_bookings:cancel",
    SELF_BOOKINGS_ALL: "self_bookings:*",

    // ==================== SELF PICKUPS ====================
    SELF_PICKUPS_CREATE: "self_pickups:create",
    SELF_PICKUPS_READ: "self_pickups:read",
    SELF_PICKUPS_APPROVE: "self_pickups:approve",
    SELF_PICKUPS_CANCEL: "self_pickups:cancel",
    SELF_PICKUPS_EXPORT: "self_pickups:export",
    SELF_PICKUPS_VIEW_PAGE: "self_pickups:view_page",
    // Mark a pickup as no-cost (waives all pricing). Distinct from
    // :approve — that's the quote approval path; this is the pricing
    // waiver path. Entity-specific so access policies can grant it
    // independently. See plan file tender-knitting-avalanche.md SP4.
    SELF_PICKUPS_MARK_NO_COST: "self_pickups:mark_no_cost",
    SELF_PICKUPS_ALL: "self_pickups:*",

    // ==================== STOCK MOVEMENTS ====================
    STOCK_MOVEMENTS_READ: "stock_movements:read",
    STOCK_MOVEMENTS_ADJUST: "stock_movements:adjust",
    STOCK_MOVEMENTS_VIEW_PAGE: "stock_movements:view_page",
};

export const PERMISSION_TEMPLATES = {
    PLATFORM_ADMIN: [
        PERMISSIONS.AUTH_ALL,
        PERMISSIONS.USERS_ALL,
        PERMISSIONS.COMPANIES_ALL,
        PERMISSIONS.BRANDS_ALL,
        PERMISSIONS.COUNTRIES_ALL,
        PERMISSIONS.CITIES_ALL,
        PERMISSIONS.WAREHOUSES_ALL,
        PERMISSIONS.ZONES_ALL,
        PERMISSIONS.ASSETS_ALL,
        PERMISSIONS.COLLECTIONS_ALL,
        PERMISSIONS.TEAMS_ALL,
        PERMISSIONS.SERVICE_REQUESTS_ALL,
        PERMISSIONS.INBOUND_REQUESTS_ALL,
        PERMISSIONS.LINE_ITEM_REQUESTS_ALL,
        PERMISSIONS.WORKFLOW_REQUESTS_ALL,
        PERMISSIONS.WORKFLOW_DEFINITIONS_ALL,
        PERMISSIONS.PLATFORM_SETTINGS_ALL,
        PERMISSIONS.NOTIFICATION_RULES_ALL,
        PERMISSIONS.ATTACHMENT_TYPES_ALL,
        PERMISSIONS.ACCESS_POLICIES_ALL,
        PERMISSIONS.WAREHOUSE_OPS_RATES_ALL,
        PERMISSIONS.SERVICE_TYPES_ALL,
        PERMISSIONS.PRICING_ALL,
        PERMISSIONS.ORDERS_ALL,
        PERMISSIONS.INVOICES_ALL,
        PERMISSIONS.SCANNING_ALL,
        PERMISSIONS.INVENTORY_ALL,
        PERMISSIONS.CONDITIONS_ALL,
        PERMISSIONS.LIFECYCLE_ALL,
        PERMISSIONS.NOTIFICATIONS_ALL,
        PERMISSIONS.ANALYTICS_ALL,
        PERMISSIONS.CALENDAR_ALL,
        PERMISSIONS.SELF_PICKUPS_ALL,
        PERMISSIONS.STOCK_MOVEMENTS_READ,
        PERMISSIONS.STOCK_MOVEMENTS_ADJUST,
        PERMISSIONS.ANALYTICS_VIEW_PAGE,
        PERMISSIONS.ANALYTICS_VIEW_REPORTS_PAGE,
        PERMISSIONS.ORDERS_VIEW_PAGE,
        PERMISSIONS.ORDERS_VIEW_PENDING_APPROVAL_PAGE,
        PERMISSIONS.SERVICE_REQUESTS_VIEW_PAGE,
        PERMISSIONS.WORKFLOW_REQUESTS_VIEW_PAGE,
        PERMISSIONS.LINE_ITEM_REQUESTS_VIEW_PAGE,
        PERMISSIONS.SELF_BOOKINGS_VIEW_PAGE,
        PERMISSIONS.CALENDAR_VIEW_PAGE,
        PERMISSIONS.INVOICES_VIEW_PAGE,
        PERMISSIONS.ASSETS_VIEW_PAGE,
        PERMISSIONS.COLLECTIONS_VIEW_PAGE,
        PERMISSIONS.INBOUND_REQUESTS_VIEW_PAGE,
        PERMISSIONS.CONDITIONS_VIEW_PAGE,
        PERMISSIONS.WAREHOUSES_VIEW_PAGE,
        PERMISSIONS.ZONES_VIEW_PAGE,
        PERMISSIONS.USERS_VIEW_PAGE,
        PERMISSIONS.COMPANIES_VIEW_PAGE,
        PERMISSIONS.BRANDS_VIEW_PAGE,
        PERMISSIONS.TEAMS_VIEW_PAGE,
        PERMISSIONS.PLATFORM_SETTINGS_VIEW_PAGE,
        PERMISSIONS.NOTIFICATION_RULES_VIEW_PAGE,
        PERMISSIONS.ATTACHMENT_TYPES_VIEW_PAGE,
        PERMISSIONS.WORKFLOW_DEFINITIONS_VIEW_PAGE,
        PERMISSIONS.ACCESS_POLICIES_VIEW_PAGE,
        PERMISSIONS.SERVICE_TYPES_VIEW_PAGE,
        PERMISSIONS.WAREHOUSE_OPS_RATES_VIEW_PAGE,
        PERMISSIONS.COUNTRIES_VIEW_PAGE,
        PERMISSIONS.CITIES_VIEW_PAGE,
        PERMISSIONS.SELF_PICKUPS_VIEW_PAGE,
        PERMISSIONS.STOCK_MOVEMENTS_VIEW_PAGE,
    ],
    LOGISTICS_STAFF: [
        PERMISSIONS.AUTH_LOGIN,
        PERMISSIONS.AUTH_RESET_PASSWORD,
        PERMISSIONS.USERS_READ,
        PERMISSIONS.COMPANIES_READ,
        PERMISSIONS.BRANDS_READ,
        PERMISSIONS.BRANDS_CREATE,
        PERMISSIONS.BRANDS_UPDATE,
        PERMISSIONS.COUNTRIES_READ,
        PERMISSIONS.CITIES_READ,
        PERMISSIONS.WAREHOUSES_READ,
        PERMISSIONS.WAREHOUSES_CREATE,
        PERMISSIONS.WAREHOUSES_UPDATE,
        PERMISSIONS.ZONES_READ,
        PERMISSIONS.ZONES_CREATE,
        PERMISSIONS.ZONES_UPDATE,
        PERMISSIONS.ZONES_DELETE,
        PERMISSIONS.ASSETS_ALL,
        PERMISSIONS.COLLECTIONS_ALL,
        PERMISSIONS.ORDERS_READ,
        PERMISSIONS.ORDERS_UPDATE,
        PERMISSIONS.ORDERS_ADD_JOB_NUMBER,
        PERMISSIONS.ORDERS_ADD_TIME_WINDOWS,
        PERMISSIONS.ORDERS_VIEW_STATUS_HISTORY,
        PERMISSIONS.ORDERS_EXPORT,
        PERMISSIONS.PRICING_REVIEW,
        PERMISSIONS.PRICING_ADJUST,
        PERMISSIONS.SCANNING_ALL,
        PERMISSIONS.INVENTORY_ALL,
        PERMISSIONS.CONDITIONS_ALL,
        PERMISSIONS.LIFECYCLE_PROGRESS_STATUS,
        PERMISSIONS.LIFECYCLE_RECEIVE_NOTIFICATIONS,
        // Required for secured cost-estimate PDF routes
        PERMISSIONS.INVOICES_DOWNLOAD,
        PERMISSIONS.ASSETS_CHECK_AVAILABILITY,
        PERMISSIONS.ASSETS_AVAILABILITY_STATS,
        PERMISSIONS.ASSETS_SCAN_HISTORY,
        PERMISSIONS.CALENDAR_READ,
        PERMISSIONS.TEAMS_READ,
        PERMISSIONS.SERVICE_REQUESTS_CREATE,
        PERMISSIONS.SERVICE_REQUESTS_READ,
        PERMISSIONS.SERVICE_REQUESTS_UPDATE,
        PERMISSIONS.INBOUND_REQUESTS_READ,
        PERMISSIONS.INBOUND_REQUESTS_CREATE,
        PERMISSIONS.INBOUND_REQUESTS_UPDATE,
        PERMISSIONS.LINE_ITEM_REQUESTS_CREATE,
        PERMISSIONS.LINE_ITEM_REQUESTS_READ,
        PERMISSIONS.WORKFLOW_REQUESTS_READ,
        PERMISSIONS.WORKFLOW_REQUESTS_UPDATE,
        PERMISSIONS.ATTACHMENT_TYPES_READ,
        PERMISSIONS.SERVICE_TYPES_MANAGE,
        PERMISSIONS.SELF_PICKUPS_CREATE,
        PERMISSIONS.SELF_PICKUPS_READ,
        PERMISSIONS.SELF_PICKUPS_APPROVE,
        PERMISSIONS.SELF_PICKUPS_CANCEL,
        PERMISSIONS.SELF_PICKUPS_MARK_NO_COST,
        PERMISSIONS.SELF_PICKUPS_VIEW_PAGE,
        PERMISSIONS.STOCK_MOVEMENTS_READ,
        PERMISSIONS.STOCK_MOVEMENTS_ADJUST,
        PERMISSIONS.STOCK_MOVEMENTS_VIEW_PAGE,
    ],
    CLIENT_USER: [
        PERMISSIONS.AUTH_LOGIN,
        PERMISSIONS.AUTH_RESET_PASSWORD,
        PERMISSIONS.COMPANIES_READ,
        PERMISSIONS.BRANDS_READ,
        PERMISSIONS.COUNTRIES_READ,
        PERMISSIONS.CITIES_READ,
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
        PERMISSIONS.ASSETS_CHECK_AVAILABILITY,
        PERMISSIONS.ASSETS_AVAILABILITY_STATS,
        PERMISSIONS.CALENDAR_READ,
        PERMISSIONS.INBOUND_REQUESTS_CREATE,
        PERMISSIONS.INBOUND_REQUESTS_READ,
        PERMISSIONS.INBOUND_REQUESTS_UPDATE,
        PERMISSIONS.SERVICE_REQUESTS_CREATE,
        PERMISSIONS.SERVICE_REQUESTS_READ,
        PERMISSIONS.ATTACHMENT_TYPES_READ,
        PERMISSIONS.SELF_PICKUPS_CREATE,
        PERMISSIONS.SELF_PICKUPS_READ,
        PERMISSIONS.SELF_PICKUPS_CANCEL,
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
