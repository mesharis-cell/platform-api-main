/**
 * Permission Constants
 * 
 * Naming Convention: {module}:{action}
 * Examples: auth:login, orders:create, assets:read
 * 
 * This file defines all available permissions in the system.
 * Each permission should be added to the user's permissions array to grant access.
 */

export const PERMISSIONS = {
    // ==================== AUTHENTICATION ====================
    AUTH_LOGIN: 'auth:login',
    AUTH_RESET_PASSWORD: 'auth:reset_password',

    // ==================== USER MANAGEMENT ====================
    USERS_CREATE: 'users:create',
    USERS_READ: 'users:read',

    // ==================== COMPANY MANAGEMENT ====================
    COMPANIES_CREATE: 'companies:create',
    COMPANIES_READ: 'companies:read',
    COMPANIES_UPDATE: 'companies:update',
    COMPANIES_ARCHIVE: 'companies:archive',
    COMPANIES_SET_MARGIN: 'companies:set_margin',

    // ==================== WAREHOUSE MANAGEMENT ====================
    WAREHOUSES_CREATE: 'warehouses:create',
    WAREHOUSES_READ: 'warehouses:read',
    WAREHOUSES_UPDATE: 'warehouses:update',
    WAREHOUSES_ARCHIVE: 'warehouses:archive',

    // ==================== ZONE MANAGEMENT ====================
    ZONES_CREATE: 'zones:create',
    ZONES_READ: 'zones:read',
    ZONES_UPDATE: 'zones:update',
    ZONES_DELETE: 'zones:delete',
    ZONES_ASSIGN_COMPANY: 'zones:assign_company',

    // ==================== BRAND MANAGEMENT ====================
    BRANDS_CREATE: 'brands:create',
    BRANDS_READ: 'brands:read',
    BRANDS_UPDATE: 'brands:update',
    BRANDS_DELETE: 'brands:delete',

    // ==================== ASSET MANAGEMENT ====================
    ASSETS_CREATE: 'assets:create',
    ASSETS_READ: 'assets:read',
    ASSETS_UPDATE: 'assets:update',
    ASSETS_DELETE: 'assets:delete',
    ASSETS_GENERATE_QR: 'assets:generate_qr',
    ASSETS_UPLOAD_PHOTOS: 'assets:upload_photos',
    ASSETS_ALL: 'assets:*',

    // ==================== COLLECTION MANAGEMENT ====================
    COLLECTIONS_CREATE: 'collections:create',
    COLLECTIONS_READ: 'collections:read',
    COLLECTIONS_UPDATE: 'collections:update',
    COLLECTIONS_DELETE: 'collections:delete',
    COLLECTIONS_ASSIGN_ASSETS: 'collections:assign_assets',
    COLLECTIONS_ALL: 'collections:*',

    // ==================== PRICING CONFIGURATION ====================
    PRICING_TIERS_CREATE: 'pricing_tiers:create',
    PRICING_TIERS_READ: 'pricing_tiers:read',
    PRICING_TIERS_UPDATE: 'pricing_tiers:update',
    PRICING_TIERS_ACTIVATE: 'pricing_tiers:activate',
    PRICING_TIERS_DEACTIVATE: 'pricing_tiers:deactivate',

    // ==================== PRICING REVIEW ====================
    PRICING_REVIEW: 'pricing:review',
    PRICING_APPROVE_STANDARD: 'pricing:approve_standard',
    PRICING_ADJUST: 'pricing:adjust',
    PRICING_ADMIN_REVIEW_ADJUSTMENT: 'pricing:admin_review_adjustment',
    PRICING_ADMIN_APPROVE: 'pricing:admin_approve',

    // ==================== ORDER MANAGEMENT ====================
    ORDERS_READ: 'orders:read',
    ORDERS_UPDATE: 'orders:update',
    ORDERS_ADD_JOB_NUMBER: 'orders:add_job_number',
    ORDERS_ADD_TIME_WINDOWS: 'orders:add_time_windows',
    ORDERS_VIEW_STATUS_HISTORY: 'orders:view_status_history',
    ORDERS_EXPORT: 'orders:export',

    // ==================== INVOICING ====================
    INVOICES_GENERATE: 'invoices:generate',
    INVOICES_READ: 'invoices:read',
    INVOICES_DOWNLOAD: 'invoices:download',
    INVOICES_CONFIRM_PAYMENT: 'invoices:confirm_payment',
    INVOICES_TRACK_PAYMENT_STATUS: 'invoices:track_payment_status',

    // ==================== QR SCANNING ====================
    SCANNING_SCAN_OUT: 'scanning:scan_out',
    SCANNING_SCAN_IN: 'scanning:scan_in',
    SCANNING_CAPTURE_TRUCK_PHOTOS: 'scanning:capture_truck_photos',

    // ==================== INVENTORY TRACKING ====================
    INVENTORY_MONITOR_AVAILABILITY: 'inventory:monitor_availability',
    INVENTORY_TRACK_STATUS: 'inventory:track_status',
    INVENTORY_UPDATE_QUANTITIES: 'inventory:update_quantities',

    // ==================== CONDITION MANAGEMENT ====================
    CONDITIONS_UPDATE: 'conditions:update',
    CONDITIONS_VIEW_HISTORY: 'conditions:view_history',
    CONDITIONS_VIEW_ITEMS_NEEDING_ATTENTION: 'conditions:view_items_needing_attention',
    CONDITIONS_COMPLETE_MAINTENANCE: 'conditions:complete_maintenance',

    // ==================== LIFECYCLE & NOTIFICATIONS ====================
    LIFECYCLE_PROGRESS_STATUS: 'lifecycle:progress_status',
    LIFECYCLE_RECEIVE_NOTIFICATIONS: 'lifecycle:receive_notifications',
    NOTIFICATIONS_VIEW_FAILED: 'notifications:view_failed',
    NOTIFICATIONS_RETRY: 'notifications:retry',

    // ==================== ANALYTICS ====================
    ANALYTICS_VIEW_REVENUE: 'analytics:view_revenue',
    ANALYTICS_TRACK_MARGIN: 'analytics:track_margin',
    ANALYTICS_FILTER_BY_COMPANY: 'analytics:filter_by_company',
} as const;

// Type for all permission values
export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Helper to get all permission values as an array
export const getAllPermissions = (): Permission[] => {
    return Object.values(PERMISSIONS);
};

// Helper to check if a string is a valid permission
export const isValidPermission = (permission: string): permission is Permission => {
    return getAllPermissions().includes(permission as Permission);
};
