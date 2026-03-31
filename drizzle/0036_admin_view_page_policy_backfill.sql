WITH page_permissions AS (
    SELECT
        ARRAY[
            'analytics:view_page',
            'analytics:view_reports_page',
            'orders:view_page',
            'orders:view_pending_approval_page',
            'service_requests:view_page',
            'workflow_requests:view_page',
            'line_item_requests:view_page',
            'self_bookings:view_page',
            'calendar:view_page',
            'invoices:view_page',
            'assets:view_page',
            'collections:view_page',
            'inbound_requests:view_page',
            'conditions:view_page',
            'warehouses:view_page',
            'zones:view_page',
            'users:view_page',
            'companies:view_page',
            'brands:view_page',
            'teams:view_page',
            'platform_settings:view_page',
            'notification_rules:view_page',
            'attachment_types:view_page',
            'workflow_definitions:view_page',
            'access_policies:view_page',
            'service_types:view_page',
            'warehouse_ops_rates:view_page',
            'countries:view_page',
            'cities:view_page'
        ]::text[] AS permissions
)
UPDATE access_policies ap
SET
    permissions = ARRAY(
        SELECT DISTINCT permission
        FROM unnest(COALESCE(ap.permissions, ARRAY[]::text[]) || pp.permissions) AS permission
        ORDER BY permission
    ),
    updated_at = now()
FROM page_permissions pp
WHERE ap.role = 'ADMIN';
