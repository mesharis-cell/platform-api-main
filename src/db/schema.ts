import { relations, sql } from "drizzle-orm";
import {
    type AnyPgColumn,
    boolean,
    decimal,
    foreignKey,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

// ============================================================
// Enums
// ============================================================
export const userRoleEnum = pgEnum("user_role", [
    "ADMIN", // Platform Admin (Agency/Operator)
    "LOGISTICS", // Logistics Staff (Fulfillment Partner)
    "CLIENT", // Client User (Company User)
]);

export const hostnameTypeEnum = pgEnum("hostname_type", ["VANITY", "CUSTOM"]);

export const trackingMethodEnum = pgEnum("tracking_method", ["INDIVIDUAL", "BATCH"]);
export const stockModeEnum = pgEnum("stock_mode", ["SERIALIZED", "POOLED"]);
export const assetConditionEnum = pgEnum("asset_condition", ["GREEN", "ORANGE", "RED"]);
export const assetStatusEnum = pgEnum("asset_status", [
    "AVAILABLE",
    "BOOKED",
    "OUT",
    "MAINTENANCE",
    "TRANSFORMED",
]);
// export const assetCategoryEnum = pgEnum('asset_category', [
//   'FURNITURE',
//   'GLASSWARE',
//   'INSTALLATION',
//   'DECOR',
//   'OTHER',
// ])
export const orderStatusEnum = pgEnum("order_status", [
    "DRAFT",
    "SUBMITTED",
    "PRICING_REVIEW",
    "PENDING_APPROVAL",
    "QUOTED",
    "DECLINED",
    "CONFIRMED",
    "IN_PREPARATION",
    "READY_FOR_DELIVERY",
    "IN_TRANSIT",
    "DELIVERED",
    "IN_USE",
    "DERIG",
    "AWAITING_RETURN",
    "RETURN_IN_TRANSIT",
    "CLOSED",
    "CANCELLED",
]);

export const inboundRequestStatusEnum = pgEnum("inbound_request_status_enum", [
    "PRICING_REVIEW",
    "PENDING_APPROVAL",
    "QUOTED",
    "CONFIRMED",
    "DECLINED",
    "CANCELLED",
    "COMPLETED",
]);

export const financialStatusEnum = pgEnum("financial_status", [
    "PENDING_QUOTE",
    "QUOTE_SENT",
    "QUOTE_REVISED",
    "QUOTE_ACCEPTED",
    "PENDING_INVOICE",
    "INVOICED",
    "PAID",
    "CANCELLED",
]);
export const notificationStatusEnum = pgEnum("notification_status", [
    "QUEUED",
    "PROCESSING",
    "SENT",
    "FAILED",
    "RETRYING",
    "SKIPPED",
]);
export const entityTypeEnum = pgEnum("entity_type", [
    "ORDER",
    "INBOUND_REQUEST",
    "SERVICE_REQUEST",
    "USER",
    "SELF_BOOKING",
    "SELF_PICKUP",
    "ASSET",
]);
export const recipientTypeEnum = pgEnum("recipient_type", ["ROLE", "ENTITY_OWNER", "EMAIL"]);
export const scanTypeEnum = pgEnum("scan_type", [
    "OUTBOUND",
    "INBOUND",
    "DERIG_CAPTURE",
    "OUTBOUND_TRUCK_PHOTOS",
    "RETURN_TRUCK_PHOTOS",
    "ON_SITE_CAPTURE",
]);
export const discrepancyReasonEnum = pgEnum("discrepancy_reason", ["BROKEN", "LOST", "OTHER"]);
export const lineItemTypeEnum = pgEnum("line_item_type", ["CATALOG", "CUSTOM", "SYSTEM"]);
export const systemLineKeyEnum = pgEnum("system_line_key", ["BASE_OPS"]);
export const billingModeEnum = pgEnum("billing_mode", [
    "BILLABLE",
    "NON_BILLABLE",
    "COMPLIMENTARY",
]);
export const lineItemRequestStatusEnum = pgEnum("line_item_request_status", [
    "REQUESTED",
    "APPROVED",
    "REJECTED",
]);
export const transportTripLegEnum = pgEnum("transport_trip_leg", [
    "DELIVERY",
    "PICKUP",
    "ACCESS",
    "TRANSFER",
]);
export const maintenanceDecisionEnum = pgEnum("maintenance_decision", [
    "FIX_IN_ORDER",
    "USE_AS_IS",
]);
export const serviceCategoryEnum = pgEnum("service_category", [
    "ASSEMBLY",
    "EQUIPMENT",
    "HANDLING",
    "RESKIN",
    "TRANSPORT",
    "OTHER",
]);

export const invoiceTypeEnum = pgEnum("invoice_type", [
    "ORDER",
    "INBOUND_REQUEST",
    "SERVICE_REQUEST",
    "SELF_PICKUP",
]);
export const serviceRequestTypeEnum = pgEnum("service_request_type", [
    "MAINTENANCE",
    "RESKIN",
    "REFURBISHMENT",
    "CUSTOM",
]);
export const serviceRequestStatusEnum = pgEnum("service_request_status", [
    "DRAFT",
    "SUBMITTED",
    "IN_REVIEW",
    "APPROVED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
]);
export const serviceRequestCommercialStatusEnum = pgEnum("service_request_commercial_status", [
    "INTERNAL",
    "PENDING_QUOTE",
    "QUOTED",
    "QUOTE_APPROVED",
    "INVOICED",
    "PAID",
    "CANCELLED",
]);
export const serviceRequestBillingModeEnum = pgEnum("service_request_billing_mode", [
    "INTERNAL_ONLY",
    "CLIENT_BILLABLE",
]);
export const serviceRequestLinkModeEnum = pgEnum("service_request_link_mode", [
    "STANDALONE",
    "BUNDLED_WITH_ORDER",
    "SEPARATE_CHANGE_REQUEST",
]);
export const workflowRequestEntityTypeEnum = pgEnum("workflow_request_entity_type", [
    "ORDER",
    "INBOUND_REQUEST",
    "SERVICE_REQUEST",
    "SELF_PICKUP",
]);
export const workflowRequestStatusEnum = pgEnum("workflow_request_status", [
    "REQUESTED",
    "ACKNOWLEDGED",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
]);
export const attachmentEntityTypeEnum = pgEnum("attachment_entity_type", [
    "ORDER",
    "INBOUND_REQUEST",
    "SERVICE_REQUEST",
    "WORKFLOW_REQUEST",
    "SELF_PICKUP",
]);

// ---------------------------------- SELF-PICKUP / STOCK-MOVEMENT ENUMS -------------------
export const selfPickupStatusEnum = pgEnum("self_pickup_status", [
    "SUBMITTED",
    "PRICING_REVIEW",
    "PENDING_APPROVAL",
    "QUOTED",
    "DECLINED",
    "CONFIRMED",
    "READY_FOR_PICKUP",
    "PICKED_UP",
    "IN_USE",
    "AWAITING_RETURN",
    "RETURNED",
    "CLOSED",
    "CANCELLED",
]);

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
    "OUTBOUND",
    "INBOUND",
    "WRITE_OFF",
    "ADJUSTMENT",
    "INITIAL",
]);

export const stockWriteOffReasonEnum = pgEnum("stock_write_off_reason", [
    "CONSUMED",
    "LOST",
    "DAMAGED",
    "OTHER",
]);

// ---------------------------------- PLATFORM -------------------------------------------
// Config structure:
// {
//   "logo_url": "https://...",
//   "primary_color": "#000000",
//   "secondary_color": "#ffffff",
//   "logistics_partner_name": "A2 Logistics",
//   "support_email": "support@platform.com",
//   "currency": "AED",
//   "feasibility": {
//     "minimum_lead_hours": 24,
//     "exclude_weekends": true,
//     "weekend_days": [0, 6],
//     "timezone": "Asia/Dubai"
//   }
// }

// Features structure:
// {
//   "collections": true,
//   "bulk_import": true,
//   "advanced_reporting": false,
//   "api_access": false
//   "show_estimate_on_order_creation": true,  // Default for all companies
//   "enable_inbound_requests": true
// }

export const platforms = pgTable(
    "platforms",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: varchar("name", { length: 100 }).notNull(),
        domain: varchar("domain", { length: 100 }).notNull().unique(),
        config: jsonb("config").default({}).notNull(),
        features: jsonb("features").default({}).notNull(),
        vat_percent: decimal("vat_percent", { precision: 5, scale: 2 }).notNull().default("0.00"),
        maintenance_mode: boolean("maintenance_mode").notNull().default(false),
        maintenance_message: text("maintenance_message"),
        maintenance_until: timestamp("maintenance_until"),
        maintenance_updated_at: timestamp("maintenance_updated_at"),
        maintenance_updated_by: uuid("maintenance_updated_by"),
        is_active: boolean("is_active").default(true).notNull(),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index("platforms_domain_idx").on(table.domain)]
);

export const platformsRelations = relations(platforms, ({ many }) => ({
    companies: many(companies),
    users: many(users),
    access_policies: many(accessPolicies),
    warehouses: many(warehouses),
    asset_families: many(assetFamilies),
    workflow_requests: many(workflowRequests),
    workflow_definitions: many(workflowDefinitions),
    workflow_definition_company_overrides: many(workflowDefinitionCompanyOverrides),
    attachment_types: many(attachmentTypes),
    entity_attachments: many(entityAttachments),
}));

// ---------------------------------- COMPANY & COMPANY DOMAINS ---------------------------
// Settings structure:
// {
//   "branding": {
//     "title": "Diageo",
//     "logo_url": "https://...",
//     "primary_color": "#000000",
//     "secondary_color": "#ffffff"
//   }
// }

export const companies = pgTable(
    "companies",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 100 }).notNull(),
        domain: varchar("domain", { length: 50 }).notNull(), // Subdomain
        settings: jsonb("settings").default({}).notNull(),
        platform_margin_percent: decimal("platform_margin_percent", {
            precision: 5,
            scale: 2,
        })
            .notNull()
            .default("25.00"),
        warehouse_ops_rate: decimal("warehouse_ops_rate", { precision: 10, scale: 2 })
            .notNull()
            .default("25.20"), // AED per m³
        vat_percent_override: decimal("vat_percent_override", { precision: 5, scale: 2 }),
        contact_email: varchar("contact_email", { length: 255 }),
        contact_phone: varchar("contact_phone", { length: 50 }),
        features: jsonb("features").default({}).notNull(), // {show_estimate_on_order_creation: false  // This company's overrid }
        is_active: boolean("is_active").default(true).notNull(),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
        deleted_at: timestamp("deleted_at"),
    },
    (table) => [
        index("companies_platform_idx").on(table.platform_id),
        unique("companies_platform_domain_unique").on(table.platform_id, table.domain), // Domain must be unique within a platform
    ]
);

export const companyDomains = pgTable(
    "company_domains",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        company_id: uuid("company")
            .notNull()
            .references(() => companies.id, { onDelete: "cascade" }),
        hostname: text("hostname").notNull().unique(), // e.g., 'client.diageo.com' or 'diageo.pmg-platform.com'
        type: hostnameTypeEnum("type").notNull(),
        is_verified: boolean("is_verified").default(false).notNull(),
        is_active: boolean("is_active").default(true).notNull(),
        is_primary: boolean("is_primary").default(false).notNull(),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("company_domains_hostname_idx").on(table.hostname),
        uniqueIndex("company_domains_one_active_primary_idx")
            .on(table.company_id)
            .where(sql`${table.is_primary} = true and ${table.is_active} = true`),
    ]
);

export const companiesRelations = relations(companies, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [companies.platform_id],
        references: [platforms.id],
    }),
    domains: many(companyDomains),
    brands: many(brands),
    zones: many(zones),
    asset_families: many(assetFamilies),
    assets: many(assets),
    collections: many(collections),
    orders: many(orders),
    inbound_requests: many(inboundRequests),
    service_requests: many(serviceRequests),
    users: many(users),
    line_item_requests: many(lineItemRequests),
    workflow_definition_company_overrides: many(workflowDefinitionCompanyOverrides),
}));

export const companyDomainsRelations = relations(companyDomains, ({ one }) => ({
    company: one(companies, {
        fields: [companyDomains.company_id],
        references: [companies.id],
    }),
    platform: one(platforms, {
        fields: [companyDomains.platform_id],
        references: [platforms.id],
    }),
}));

// ---------------------------------- ACCESS POLICY ---------------------------------------
export const accessPolicies = pgTable(
    "access_policies",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        role: userRoleEnum("role").notNull(),
        code: varchar("code", { length: 64 }).notNull(),
        name: varchar("name", { length: 120 }).notNull(),
        description: text("description"),
        permissions: text("permissions")
            .array()
            .notNull()
            .default(sql`ARRAY[]::text[]`),
        is_active: boolean("is_active").notNull().default(true),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        unique("access_policies_platform_code_unique").on(table.platform_id, table.code),
        index("access_policies_platform_role_idx").on(table.platform_id, table.role),
    ]
);

export const accessPoliciesRelations = relations(accessPolicies, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [accessPolicies.platform_id],
        references: [platforms.id],
    }),
    users: many(users),
}));

// ---------------------------------- USER ------------------------------------------------
export const users = pgTable(
    "users",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        company_id: uuid("company").references(() => companies.id), // Multi-tenancy: Client users belong to a company, Admin/Logistics are null
        name: varchar("name", { length: 100 }).notNull(),
        email: varchar("email", { length: 255 }).notNull(),
        password: varchar("password", { length: 255 }).notNull(), // hashed password
        role: userRoleEnum("role").notNull().default("CLIENT"),
        permissions: text("permissions")
            .array()
            .notNull()
            .default(sql`ARRAY[]::text[]`),
        access_policy_id: uuid("access_policy_id").references(() => accessPolicies.id, {
            onDelete: "set null",
        }),
        permission_grants: text("permission_grants")
            .array()
            .notNull()
            .default(sql`ARRAY[]::text[]`),
        permission_revokes: text("permission_revokes")
            .array()
            .notNull()
            .default(sql`ARRAY[]::text[]`),
        is_super_admin: boolean("is_super_admin").notNull().default(false),
        is_active: boolean("is_active").notNull().default(true),
        last_login_at: timestamp("last_login_at"),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("user_platform_idx").on(table.platform_id),
        index("user_company_idx").on(table.company_id),
        // IMPORTANT: Email is unique PER PLATFORM, not globally
        uniqueIndex("user_platform_email_unique").on(table.platform_id, table.email),
    ]
);

export const userRelations = relations(users, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [users.platform_id],
        references: [platforms.id],
    }),
    access_policy: one(accessPolicies, {
        fields: [users.access_policy_id],
        references: [accessPolicies.id],
    }),
    company: one(companies, {
        fields: [users.company_id],
        references: [companies.id],
    }),
    orders: many(orders),
    scanned_assets: many(assets), // For lastScannedBy
}));

// ---------------------------------- BRAND -----------------------------------------------
export const brands = pgTable(
    "brands",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        company_id: uuid("company")
            .notNull()
            .references(() => companies.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 100 }).notNull(),
        description: text("description"),
        logo_url: text("logo_url"),
        is_active: boolean("is_active").notNull().default(true),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [unique("brands_company_name_unique").on(table.company_id, table.name)]
);

export const brandsRelations = relations(brands, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [brands.platform_id],
        references: [platforms.id],
    }),
    company: one(companies, {
        fields: [brands.company_id],
        references: [companies.id],
    }),
    asset_families: many(assetFamilies),
    assets: many(assets),
    collections: many(collections),
}));

// ---------------------------------- WAREHOUSE -------------------------------------------
export const warehouses = pgTable(
    "warehouses",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 100 }).notNull(),
        country: varchar("country", { length: 50 }).notNull(),
        city: varchar("city", { length: 50 }).notNull(),
        address: text("address").notNull(),
        coordinates: jsonb("coordinates"), // GPS coordinates {lat, lng}
        is_active: boolean("is_active").notNull().default(true),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [unique("warehouses_platform_name_unique").on(table.platform_id, table.name)]
);

export const warehousesRelations = relations(warehouses, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [warehouses.platform_id],
        references: [platforms.id],
    }),
    zones: many(zones),
    assets: many(assets),
}));

// ---------------------------------- ZONES -----------------------------------------------
export const zones = pgTable(
    "zones",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        warehouse_id: uuid("warehouse")
            .notNull()
            .references(() => warehouses.id),
        company_id: uuid("company")
            .notNull()
            .references(() => companies.id),
        name: varchar("name", { length: 50 }).notNull(),
        description: text("description"),
        capacity: integer("capacity"),
        is_active: boolean("is_active").notNull().default(true),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        unique("zones_warehouse_company_name_unique").on(
            table.warehouse_id,
            table.company_id,
            table.name
        ),
    ]
);

export const zonesRelations = relations(zones, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [zones.platform_id],
        references: [platforms.id],
    }),
    warehouse: one(warehouses, {
        fields: [zones.warehouse_id],
        references: [warehouses.id],
    }),
    company: one(companies, {
        fields: [zones.company_id],
        references: [companies.id],
    }),
    assets: many(assets),
}));

// ---------------------------------- ASSET FAMILY -----------------------------------------
export const assetFamilies = pgTable(
    "asset_families",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        company_id: uuid("company_id")
            .notNull()
            .references(() => companies.id, { onDelete: "cascade" }),
        brand_id: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),
        team_id: uuid("team_id").references((): AnyPgColumn => teams.id, { onDelete: "set null" }),
        name: varchar("name", { length: 200 }).notNull(),
        company_item_code: varchar("company_item_code", { length: 150 }),
        description: text("description"),
        category: varchar("category", { length: 100 }).notNull(),
        images: jsonb("images")
            .notNull()
            .default(sql`'[]'::jsonb`),
        on_display_image: text("on_display_image"),
        stock_mode: stockModeEnum("stock_mode").notNull(),
        packaging: varchar("packaging", { length: 100 }),
        weight_per_unit: decimal("weight_per_unit", { precision: 8, scale: 2 }),
        dimensions: jsonb("dimensions")
            .notNull()
            .default(sql`'{}'::jsonb`),
        volume_per_unit: decimal("volume_per_unit", { precision: 8, scale: 3 }),
        handling_tags: text("handling_tags")
            .array()
            .notNull()
            .default(sql`ARRAY[]::text[]`),
        is_active: boolean("is_active").notNull().default(true),
        low_stock_threshold: integer("low_stock_threshold"),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
        deleted_at: timestamp("deleted_at"),
    },
    (table) => [
        index("asset_families_platform_idx").on(table.platform_id),
        index("asset_families_company_idx").on(table.company_id),
        index("asset_families_brand_idx").on(table.brand_id),
        index("asset_families_team_idx").on(table.team_id),
        index("asset_families_company_item_code_idx").on(table.company_item_code),
        index("asset_families_stock_mode_idx").on(table.stock_mode),
        unique("asset_families_platform_company_name_unique").on(
            table.platform_id,
            table.company_id,
            table.name
        ),
        unique("asset_families_platform_company_item_code_unique").on(
            table.platform_id,
            table.company_id,
            table.company_item_code
        ),
    ]
);

export const assetFamiliesRelations = relations(assetFamilies, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [assetFamilies.platform_id],
        references: [platforms.id],
    }),
    company: one(companies, {
        fields: [assetFamilies.company_id],
        references: [companies.id],
    }),
    brand: one(brands, {
        fields: [assetFamilies.brand_id],
        references: [brands.id],
    }),
    team: one(teams, {
        fields: [assetFamilies.team_id],
        references: [teams.id],
    }),
    assets: many(assets),
}));

// ---------------------------------- ASSET -----------------------------------------------
export const assets = pgTable(
    "assets",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        company_id: uuid("company_id")
            .notNull()
            .references(() => companies.id, { onDelete: "cascade" }),
        warehouse_id: uuid("warehouse_id")
            .notNull()
            .references(() => warehouses.id),
        zone_id: uuid("zone_id")
            .notNull()
            .references(() => zones.id),
        brand_id: uuid("brand_id").references(() => brands.id),
        family_id: uuid("family_id").references(() => assetFamilies.id, { onDelete: "set null" }),
        name: varchar("name", { length: 200 }).notNull(),
        description: text("description"),
        category: varchar("category", { length: 100 }).notNull(),
        images: jsonb("images")
            .notNull()
            .default(sql`'[]'::jsonb`), // AssetImage[]: {url: string, note?: string}
        on_display_image: text("on_display_image"),
        tracking_method: trackingMethodEnum("tracking_method").notNull(),
        total_quantity: integer("total_quantity").notNull().default(1),
        available_quantity: integer("available_quantity").notNull().default(1),
        qr_code: varchar("qr_code", { length: 100 }).notNull().unique(),
        packaging: varchar("packaging", { length: 100 }),
        weight_per_unit: decimal("weight_per_unit", { precision: 8, scale: 2 }).notNull(), // in kilograms
        dimensions: jsonb("dimensions").default({}).notNull(), // {length, width, height} in cm
        volume_per_unit: decimal("volume_per_unit", { precision: 8, scale: 3 }).notNull(), // in cubic meters
        condition: assetConditionEnum("condition").notNull().default("GREEN"),
        condition_notes: text("condition_notes"),
        refurb_days_estimate: integer("refurb_days_estimate"), // Estimated days until available (for Red condition)
        handling_tags: text("handling_tags")
            .array()
            .notNull()
            .default(sql`ARRAY[]::text[]`),
        status: assetStatusEnum("status").notNull().default("AVAILABLE"),
        last_scanned_at: timestamp("last_scanned_at"),
        last_scanned_by: uuid("last_scanned_by").references(() => users.id),

        team_id: uuid("team_id").references((): AnyPgColumn => teams.id, { onDelete: "set null" }),

        // Asset transformation tracking (NEW)
        transformed_from: uuid("transformed_from"),
        transformed_to: uuid("transformed_to"),

        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
        deleted_at: timestamp("deleted_at"),
    },
    (table) => [
        index("assets_platform_idx").on(table.platform_id),
        index("assets_company_idx").on(table.company_id),
        index("assets_qr_code_idx").on(table.qr_code),
        foreignKey({
            columns: [table.transformed_from],
            foreignColumns: [table.id],
        }),
        foreignKey({
            columns: [table.transformed_to],
            foreignColumns: [table.id],
        }),
    ]
);

export const assetsRelations = relations(assets, ({ one, many }) => ({
    company: one(companies, { fields: [assets.company_id], references: [companies.id] }),
    platform: one(platforms, { fields: [assets.platform_id], references: [platforms.id] }),
    brand: one(brands, { fields: [assets.brand_id], references: [brands.id] }),
    family: one(assetFamilies, { fields: [assets.family_id], references: [assetFamilies.id] }),
    warehouse: one(warehouses, { fields: [assets.warehouse_id], references: [warehouses.id] }),
    zone: one(zones, { fields: [assets.zone_id], references: [zones.id] }),
    last_scanned_by_user: one(users, { fields: [assets.last_scanned_by], references: [users.id] }),
    team: one(teams, { fields: [assets.team_id], references: [teams.id] }),
    collection_items: many(collectionItems),
    order_items: many(orderItems),
    scan_events: many(scanEvents),
    bookings: many(assetBookings),
    condition_history: many(assetConditionHistory),
    versions: many(assetVersions),
}));

// ---------------------------------- TEAMS -----------------------------------------------
export const teams = pgTable(
    "teams",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        company_id: uuid("company_id")
            .notNull()
            .references(() => companies.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 100 }).notNull(),
        description: text("description"),
        can_other_teams_see: boolean("can_other_teams_see").notNull().default(true),
        can_other_teams_book: boolean("can_other_teams_book").notNull().default(false),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("teams_company_idx").on(table.company_id),
        index("teams_platform_idx").on(table.platform_id),
    ]
);

export const teamsRelations = relations(teams, ({ one, many }) => ({
    company: one(companies, { fields: [teams.company_id], references: [companies.id] }),
    platform: one(platforms, { fields: [teams.platform_id], references: [platforms.id] }),
    members: many(teamMembers),
    asset_families: many(assetFamilies),
    assets: many(assets),
}));

export const teamMembers = pgTable(
    "team_members",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        team_id: uuid("team_id")
            .notNull()
            .references(() => teams.id, { onDelete: "cascade" }),
        user_id: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [unique().on(table.team_id, table.user_id)]
);

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
    team: one(teams, { fields: [teamMembers.team_id], references: [teams.id] }),
    user: one(users, { fields: [teamMembers.user_id], references: [users.id] }),
}));

// ---------------------------------- COLLECTION ------------------------------------------
export const collections = pgTable(
    "collections",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        company_id: uuid("company")
            .notNull()
            .references(() => companies.id),
        brand_id: uuid("brand").references(() => brands.id),
        team_id: uuid("team").references(() => teams.id, { onDelete: "set null" }),
        name: varchar("name", { length: 200 }).notNull(),
        description: text("description"),
        images: text("images")
            .array()
            .notNull()
            .default(sql`ARRAY[]::text[]`),
        category: varchar("category", { length: 50 }),
        is_active: boolean("is_active").notNull().default(true),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
        deleted_at: timestamp("deleted_at"),
    },
    (table) => [
        index("collections_company_idx").on(table.company_id),
        index("collections_team_idx").on(table.team_id),
    ]
);

export const collectionRelations = relations(collections, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [collections.platform_id],
        references: [platforms.id],
    }),
    company: one(companies, {
        fields: [collections.company_id],
        references: [companies.id],
    }),
    brand: one(brands, {
        fields: [collections.brand_id],
        references: [brands.id],
    }),
    team: one(teams, {
        fields: [collections.team_id],
        references: [teams.id],
    }),
    assets: many(collectionItems),
    orders: many(orders),
}));

// ---------------------------------- COLLECTION ITEM --------------------------------------
export const collectionItems = pgTable(
    "collection_items",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        collection: uuid("collection")
            .notNull()
            .references(() => collections.id, { onDelete: "cascade" }),
        asset: uuid("asset")
            .notNull()
            .references(() => assets.id),
        default_quantity: integer("default_quantity").notNull().default(1),
        notes: text("notes"),
        display_order: integer("display_order"), // Sort order in collection
        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [unique("collection_items_unique").on(table.collection, table.asset)]
);

export const collectionItemsRelations = relations(collectionItems, ({ one }) => ({
    collection: one(collections, {
        fields: [collectionItems.collection],
        references: [collections.id],
    }),
    asset: one(assets, { fields: [collectionItems.asset], references: [assets.id] }),
}));

// ---------------------------------- SERVICE TYPES (NEW) --------------------------------------
export const serviceTypes = pgTable(
    "service_types",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),

        name: varchar("name", { length: 100 }).notNull(),
        category: serviceCategoryEnum("category").notNull(),
        unit: varchar("unit", { length: 20 }).notNull(), // hour, day, trip, unit
        default_rate: decimal("default_rate", { precision: 10, scale: 2 }), // Nullable
        default_metadata: jsonb("default_metadata")
            .notNull()
            .default(sql`'{}'::jsonb`),
        description: text("description"),

        display_order: integer("display_order").notNull().default(0),
        is_active: boolean("is_active").notNull().default(true),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        unique("service_types_platform_name_unique").on(table.platform_id, table.name),
        index("service_types_platform_active_idx").on(
            table.platform_id,
            table.is_active,
            table.display_order
        ),
    ]
);

export const serviceTypesRelations = relations(serviceTypes, ({ one, many }) => ({
    platform: one(platforms, { fields: [serviceTypes.platform_id], references: [platforms.id] }),
    order_line_items: many(lineItems),
}));

// ---------------------------------- ORDER ------------------------------------------------
export const orders = pgTable(
    "orders",
    {
        // Core identifiers
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        order_id: varchar("order_id", { length: 20 }).notNull(), // Human-readable ID (ORD-YYYYMMDD-XXX)
        company_id: uuid("company")
            .notNull()
            .references(() => companies.id),
        brand_id: uuid("brand").references(() => brands.id),
        created_by: uuid("created_by")
            .notNull()
            .references(() => users.id),
        job_number: varchar("job_number", { length: 50 }),
        po_number: varchar("po_number", { length: 100 }),

        // Execution contact (the client-side runner of the event/activation)
        contact_name: varchar("contact_name", { length: 100 }).notNull(),
        contact_email: varchar("contact_email", { length: 255 }).notNull(),
        contact_phone: varchar("contact_phone", { length: 50 }).notNull(),

        // Venue contact (on-site coordinator — separate from permits)
        venue_contact_name: varchar("venue_contact_name", { length: 100 }),
        venue_contact_email: varchar("venue_contact_email", { length: 255 }),
        venue_contact_phone: varchar("venue_contact_phone", { length: 50 }),

        // Event details
        event_start_date: timestamp("event_start_date", { mode: "date" }).notNull(),
        event_end_date: timestamp("event_end_date", { mode: "date" }).notNull(),
        venue_name: varchar("venue_name", { length: 200 }).notNull(),
        venue_city_id: uuid("venue_city_id")
            .notNull()
            .references(() => cities.id),
        venue_location: jsonb("venue_location").notNull(), // {country, city, address, access_notes}
        permit_requirements: jsonb("permit_requirements"),
        special_instructions: text("special_instructions"),

        // Logistics windows
        // requested_* are client-requested (immutable after submit, never trampled by logistics).
        // delivery_window / pickup_window are logistics-authoritative (editable by ops).
        requested_delivery_window: jsonb("requested_delivery_window"),
        requested_pickup_window: jsonb("requested_pickup_window"),
        delivery_window: jsonb("delivery_window"), // {start, end} datetime
        pickup_window: jsonb("pickup_window"), // {start, end} datetime

        // Calculations
        calculated_totals: jsonb("calculated_totals").notNull(), // {volume, weight} totals

        // Pricing (NEW structure)
        order_pricing_id: uuid("order_pricing_id")
            .notNull()
            .references(() => prices.id),

        // Status tracking
        order_status: orderStatusEnum("order_status").notNull().default("DRAFT"),
        financial_status: financialStatusEnum("financial_status")
            .notNull()
            .default("PENDING_QUOTE"),

        // Scanning & photos
        scanning_data: jsonb("scanning_data").default("{}"), // {scanned_out: [], scanned_in: []}
        delivery_photos: text("delivery_photos")
            .array()
            .default(sql`ARRAY[]::text[]`),
        // Timestamps
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
        deleted_at: timestamp("deleted_at"),
    },
    (table) => [
        // Order ID unique per platform
        unique("orders_platform_order_id_unique").on(table.platform_id, table.order_id),
        // Indexes for performance
        index("orders_platform_company_idx").on(table.platform_id, table.company_id),
        index("orders_status_idx").on(table.order_status),
        index("orders_financial_status_idx").on(table.financial_status),
        index("orders_event_date_idx").on(table.event_start_date),
        index("orders_created_at_idx").on(table.created_at),
    ]
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
    platform: one(platforms, { fields: [orders.platform_id], references: [platforms.id] }),
    company: one(companies, { fields: [orders.company_id], references: [companies.id] }),
    brand: one(brands, { fields: [orders.brand_id], references: [brands.id] }),
    created_by_user: one(users, { fields: [orders.created_by], references: [users.id] }),
    order_pricing: one(prices, { fields: [orders.order_pricing_id], references: [prices.id] }),
    venue_city: one(cities, { fields: [orders.venue_city_id], references: [cities.id] }),
    items: many(orderItems),
    line_items: many(lineItems),
    transport_trips: many(orderTransportTrips),
    line_item_requests: many(lineItemRequests),
    workflow_requests: many(workflowRequests),
    attachments: many(entityAttachments),
    scan_events: many(scanEvents),
    asset_bookings: many(assetBookings),
    order_status_history: many(orderStatusHistory),
    financial_status_history: many(financialStatusHistory),
}));

// ---------------------------------- ORDER ITEM -------------------------------------------
export const orderItems = pgTable(
    "order_items",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        order_id: uuid("order")
            .notNull()
            .references(() => orders.id, { onDelete: "cascade" }),
        asset_id: uuid("asset")
            .notNull()
            .references(() => assets.id),

        // Snapshot data
        asset_name: varchar("asset_name", { length: 200 }).notNull(),
        quantity: integer("quantity").notNull(),
        volume_per_unit: decimal("volume_per_unit", { precision: 8, scale: 3 }).notNull(),
        weight_per_unit: decimal("weight_per_unit", { precision: 8, scale: 2 }).notNull(),
        total_volume: decimal("total_volume", { precision: 8, scale: 3 }).notNull(),
        total_weight: decimal("total_weight", { precision: 8, scale: 2 }).notNull(),
        condition_notes: text("condition_notes"),
        handling_tags: text("handling_tags")
            .array()
            .default(sql`ARRAY[]::text[]`),

        from_collection: uuid("from_collection").references(() => collections.id),
        from_collection_name: varchar("from_collection_name", { length: 200 }),

        // Maintenance decision fields
        maintenance_decision: maintenanceDecisionEnum("maintenance_decision"),
        requires_maintenance: boolean("requires_maintenance").notNull().default(false),
        maintenance_refurb_days_snapshot: integer("maintenance_refurb_days_snapshot"),
        maintenance_decision_locked_at: timestamp("maintenance_decision_locked_at"),
        // Pooled settlement: marks when a pooled line has been operationally acknowledged on return.
        // NULL for lines not yet settled. Applies to both serialized (auto-set on full scan) and pooled lines.
        settled_at: timestamp("settled_at"),
        settled_by: uuid("settled_by").references(() => users.id),
        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        // Indexes for performance
        index("order_items_order_idx").on(table.order_id),
        index("order_items_asset_idx").on(table.asset_id),
        index("order_items_platform_idx").on(table.platform_id),
        index("order_items_from_collection_idx").on(table.from_collection),
    ]
);

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
    platform: one(platforms, { fields: [orderItems.platform_id], references: [platforms.id] }),
    order: one(orders, { fields: [orderItems.order_id], references: [orders.id] }),
    asset: one(assets, { fields: [orderItems.asset_id], references: [assets.id] }),
    from_collection: one(collections, {
        fields: [orderItems.from_collection],
        references: [collections.id],
    }),
}));

// ---------------------------------- ORDER LINE ITEMS (NEW) -----------------------------------
export const lineItems = pgTable(
    "line_items",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        line_item_id: varchar("line_item_id", { length: 8 }).notNull(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        order_id: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
        inbound_request_id: uuid("inbound_request_id").references(() => inboundRequests.id, {
            onDelete: "cascade",
        }),
        service_request_id: uuid("service_request_id").references(() => serviceRequests.id, {
            onDelete: "cascade",
        }),
        self_pickup_id: uuid("self_pickup_id").references((): AnyPgColumn => selfPickups.id, {
            onDelete: "cascade",
        }),
        purpose_type: invoiceTypeEnum("purpose_type").notNull(),
        // Type linkage (one or neither, not both)
        service_type_id: uuid("service_type_id").references(() => serviceTypes.id), // NULL for custom items

        // Item details
        line_item_type: lineItemTypeEnum("line_item_type").notNull(),
        system_key: systemLineKeyEnum("system_key"),
        billing_mode: billingModeEnum("billing_mode").notNull().default("BILLABLE"),
        category: serviceCategoryEnum("category").notNull(),
        description: varchar("description", { length: 200 }).notNull(),

        // Pricing (for CATALOG items)
        quantity: decimal("quantity", { precision: 10, scale: 2 }),
        unit: varchar("unit", { length: 20 }),
        unit_rate: decimal("unit_rate", { precision: 10, scale: 2 }),

        // Pricing (for both)
        total: decimal("total", { precision: 10, scale: 2 }).notNull(),

        // Metadata
        added_by: uuid("added_by")
            .notNull()
            .references(() => users.id),
        added_at: timestamp("added_at").notNull().defaultNow(),
        notes: text("notes"),
        metadata: jsonb("metadata")
            .notNull()
            .default(sql`'{}'::jsonb`),
        client_price_visible: boolean("client_price_visible").notNull().default(false),

        // Voiding (for cancellations, reskin cancellations)
        is_voided: boolean("is_voided").notNull().default(false),
        voided_at: timestamp("voided_at"),
        voided_by: uuid("voided_by").references(() => users.id),
        void_reason: text("void_reason"),

        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        unique("line_items_platform_line_item_id_unique").on(table.platform_id, table.line_item_id),
        index("line_items_order_idx").on(table.order_id),
        index("line_items_inbound_request_idx").on(table.inbound_request_id),
        index("line_items_service_request_idx").on(table.service_request_id),
        index("line_items_active_idx").on(table.order_id, table.is_voided),
        uniqueIndex("line_items_order_system_key_unique")
            .on(table.platform_id, table.order_id, table.system_key)
            .where(
                sql`${table.order_id} is not null and ${table.system_key} is not null and ${table.is_voided} = false`
            ),
        uniqueIndex("line_items_inbound_system_key_unique")
            .on(table.platform_id, table.inbound_request_id, table.system_key)
            .where(
                sql`${table.inbound_request_id} is not null and ${table.system_key} is not null and ${table.is_voided} = false`
            ),
        uniqueIndex("line_items_service_request_system_key_unique")
            .on(table.platform_id, table.service_request_id, table.system_key)
            .where(
                sql`${table.service_request_id} is not null and ${table.system_key} is not null and ${table.is_voided} = false`
            ),
    ]
);

export const lineItemsRelations = relations(lineItems, ({ one }) => ({
    platform: one(platforms, { fields: [lineItems.platform_id], references: [platforms.id] }),
    order: one(orders, { fields: [lineItems.order_id], references: [orders.id] }),
    inbound_request: one(inboundRequests, {
        fields: [lineItems.inbound_request_id],
        references: [inboundRequests.id],
    }),
    service_request: one(serviceRequests, {
        fields: [lineItems.service_request_id],
        references: [serviceRequests.id],
    }),
    self_pickup: one(selfPickups, {
        fields: [lineItems.self_pickup_id],
        references: [selfPickups.id],
    }),
    service_type: one(serviceTypes, {
        fields: [lineItems.service_type_id],
        references: [serviceTypes.id],
    }),
    added_by_user: one(users, { fields: [lineItems.added_by], references: [users.id] }),
    voided_by_user: one(users, { fields: [lineItems.voided_by], references: [users.id] }),
}));

export const workflowRequests = pgTable(
    "workflow_requests",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        entity_type: workflowRequestEntityTypeEnum("entity_type").notNull(),
        entity_id: uuid("entity_id").notNull(),
        workflow_definition_id: uuid("workflow_definition_id")
            .notNull()
            .references(() => workflowDefinitions.id, { onDelete: "restrict" }),
        workflow_code: varchar("workflow_code", { length: 64 }).notNull(),
        workflow_label: varchar("workflow_label", { length: 120 }).notNull(),
        workflow_family: varchar("workflow_family", { length: 64 }).notNull(),
        status_model_key: varchar("status_model_key", { length: 64 }).notNull(),
        status: varchar("status", { length: 64 }).notNull(),
        title: varchar("title", { length: 200 }).notNull(),
        description: text("description"),
        requested_by: uuid("requested_by")
            .notNull()
            .references(() => users.id),
        requested_by_role: userRoleEnum("requested_by_role").notNull(),
        requested_at: timestamp("requested_at").notNull().defaultNow(),
        acknowledged_at: timestamp("acknowledged_at"),
        completed_at: timestamp("completed_at"),
        cancelled_at: timestamp("cancelled_at"),
        metadata: jsonb("metadata")
            .notNull()
            .default(sql`'{}'::jsonb`),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("workflow_requests_platform_entity_idx").on(
            table.platform_id,
            table.entity_type,
            table.entity_id
        ),
        index("workflow_requests_status_idx").on(table.status),
        index("workflow_requests_code_idx").on(table.workflow_code),
    ]
);

export const workflowRequestsRelations = relations(workflowRequests, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [workflowRequests.platform_id],
        references: [platforms.id],
    }),
    workflow_definition: one(workflowDefinitions, {
        fields: [workflowRequests.workflow_definition_id],
        references: [workflowDefinitions.id],
    }),
    requested_by_user: one(users, {
        fields: [workflowRequests.requested_by],
        references: [users.id],
    }),
    attachments: many(entityAttachments),
}));

export const workflowDefinitions = pgTable(
    "workflow_definitions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        code: varchar("code", { length: 64 }).notNull(),
        label: varchar("label", { length: 120 }).notNull(),
        description: text("description"),
        workflow_family: varchar("workflow_family", { length: 64 }).notNull(),
        status_model_key: varchar("status_model_key", { length: 64 }).notNull(),
        allowed_entity_types: workflowRequestEntityTypeEnum("allowed_entity_types")
            .array()
            .notNull()
            .default(sql`ARRAY[]::workflow_request_entity_type[]`),
        requester_roles: userRoleEnum("requester_roles")
            .array()
            .notNull()
            .default(sql`ARRAY['ADMIN','LOGISTICS']::user_role[]`),
        viewer_roles: userRoleEnum("viewer_roles")
            .array()
            .notNull()
            .default(sql`ARRAY['ADMIN','LOGISTICS']::user_role[]`),
        actor_roles: userRoleEnum("actor_roles")
            .array()
            .notNull()
            .default(sql`ARRAY['ADMIN','LOGISTICS']::user_role[]`),
        priority_enabled: boolean("priority_enabled").notNull().default(false),
        sla_hours: integer("sla_hours"),
        blocks_fulfillment_default: boolean("blocks_fulfillment_default").notNull().default(false),
        intake_schema: jsonb("intake_schema")
            .notNull()
            .default(sql`'{}'::jsonb`),
        is_active: boolean("is_active").notNull().default(true),
        sort_order: integer("sort_order").notNull().default(0),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        unique("workflow_definitions_platform_code_unique").on(table.platform_id, table.code),
        index("workflow_definitions_platform_sort_idx").on(table.platform_id, table.sort_order),
    ]
);

export const workflowDefinitionsRelations = relations(workflowDefinitions, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [workflowDefinitions.platform_id],
        references: [platforms.id],
    }),
    requests: many(workflowRequests),
    company_overrides: many(workflowDefinitionCompanyOverrides),
}));

export const workflowDefinitionCompanyOverrides = pgTable(
    "workflow_definition_company_overrides",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        workflow_definition_id: uuid("workflow_definition_id")
            .notNull()
            .references(() => workflowDefinitions.id, { onDelete: "cascade" }),
        company_id: uuid("company_id")
            .notNull()
            .references(() => companies.id, { onDelete: "cascade" }),
        is_enabled: boolean("is_enabled").notNull(),
        label_override: varchar("label_override", { length: 120 }),
        sort_order_override: integer("sort_order_override"),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        unique("workflow_definition_company_override_unique").on(
            table.workflow_definition_id,
            table.company_id
        ),
        index("workflow_definition_company_override_platform_idx").on(table.platform_id),
    ]
);

export const workflowDefinitionCompanyOverridesRelations = relations(
    workflowDefinitionCompanyOverrides,
    ({ one }) => ({
        platform: one(platforms, {
            fields: [workflowDefinitionCompanyOverrides.platform_id],
            references: [platforms.id],
        }),
        workflow_definition: one(workflowDefinitions, {
            fields: [workflowDefinitionCompanyOverrides.workflow_definition_id],
            references: [workflowDefinitions.id],
        }),
        company: one(companies, {
            fields: [workflowDefinitionCompanyOverrides.company_id],
            references: [companies.id],
        }),
    })
);

export const attachmentTypes = pgTable(
    "attachment_types",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        code: varchar("code", { length: 64 }).notNull(),
        label: varchar("label", { length: 120 }).notNull(),
        allowed_entity_types: attachmentEntityTypeEnum("allowed_entity_types")
            .array()
            .notNull()
            .default(sql`ARRAY[]::attachment_entity_type[]`),
        upload_roles: userRoleEnum("upload_roles")
            .array()
            .notNull()
            .default(sql`ARRAY[]::user_role[]`),
        view_roles: userRoleEnum("view_roles")
            .array()
            .notNull()
            .default(sql`ARRAY[]::user_role[]`),
        default_visible_to_client: boolean("default_visible_to_client").notNull().default(false),
        required_note: boolean("required_note").notNull().default(false),
        is_active: boolean("is_active").notNull().default(true),
        sort_order: integer("sort_order").notNull().default(0),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        unique("attachment_types_platform_code_unique").on(table.platform_id, table.code),
        index("attachment_types_platform_sort_idx").on(table.platform_id, table.sort_order),
    ]
);

export const attachmentTypesRelations = relations(attachmentTypes, ({ one, many }) => ({
    platform: one(platforms, { fields: [attachmentTypes.platform_id], references: [platforms.id] }),
    attachments: many(entityAttachments),
}));

export const entityAttachments = pgTable(
    "entity_attachments",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        entity_type: attachmentEntityTypeEnum("entity_type").notNull(),
        entity_id: uuid("entity_id").notNull(),
        attachment_type_id: uuid("attachment_type_id")
            .notNull()
            .references(() => attachmentTypes.id, { onDelete: "restrict" }),
        file_url: text("file_url").notNull(),
        file_name: varchar("file_name", { length: 255 }).notNull(),
        mime_type: varchar("mime_type", { length: 255 }).notNull(),
        file_size_bytes: integer("file_size_bytes"),
        note: text("note"),
        visible_to_client: boolean("visible_to_client").notNull().default(false),
        uploaded_by: uuid("uploaded_by")
            .notNull()
            .references(() => users.id),
        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        index("entity_attachments_entity_idx").on(table.entity_type, table.entity_id),
        index("entity_attachments_type_idx").on(table.attachment_type_id),
        index("entity_attachments_platform_idx").on(table.platform_id),
    ]
);

export const entityAttachmentsRelations = relations(entityAttachments, ({ one }) => ({
    platform: one(platforms, {
        fields: [entityAttachments.platform_id],
        references: [platforms.id],
    }),
    attachment_type: one(attachmentTypes, {
        fields: [entityAttachments.attachment_type_id],
        references: [attachmentTypes.id],
    }),
    uploaded_by_user: one(users, {
        fields: [entityAttachments.uploaded_by],
        references: [users.id],
    }),
}));

export const orderTransportTrips = pgTable(
    "order_transport_trips",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        order_id: uuid("order_id")
            .notNull()
            .references(() => orders.id, { onDelete: "cascade" }),
        leg_type: transportTripLegEnum("leg_type").notNull().default("DELIVERY"),
        truck_plate: varchar("truck_plate", { length: 80 }),
        driver_name: varchar("driver_name", { length: 120 }),
        driver_contact: varchar("driver_contact", { length: 80 }),
        truck_size: varchar("truck_size", { length: 80 }),
        manpower: integer("manpower"),
        tailgate_required: boolean("tailgate_required").notNull().default(false),
        notes: text("notes"),
        sequence_no: integer("sequence_no").notNull().default(0),
        created_by: uuid("created_by")
            .notNull()
            .references(() => users.id),
        updated_by: uuid("updated_by").references(() => users.id),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("order_transport_trips_order_idx").on(
            table.order_id,
            table.leg_type,
            table.sequence_no
        ),
        index("order_transport_trips_platform_idx").on(table.platform_id, table.order_id),
    ]
);

export const orderTransportTripsRelations = relations(orderTransportTrips, ({ one }) => ({
    platform: one(platforms, {
        fields: [orderTransportTrips.platform_id],
        references: [platforms.id],
    }),
    order: one(orders, { fields: [orderTransportTrips.order_id], references: [orders.id] }),
    created_by_user: one(users, {
        fields: [orderTransportTrips.created_by],
        references: [users.id],
        relationName: "transport_trip_created_by_user",
    }),
    updated_by_user: one(users, {
        fields: [orderTransportTrips.updated_by],
        references: [users.id],
        relationName: "transport_trip_updated_by_user",
    }),
}));

export const lineItemRequests = pgTable(
    "line_item_requests",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        line_item_request_id: varchar("line_item_request_id", { length: 20 }).notNull(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        company_id: uuid("company_id").references(() => companies.id),
        purpose_type: invoiceTypeEnum("purpose_type").notNull(),
        order_id: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
        inbound_request_id: uuid("inbound_request_id").references(() => inboundRequests.id, {
            onDelete: "cascade",
        }),
        service_request_id: uuid("service_request_id").references(() => serviceRequests.id, {
            onDelete: "cascade",
        }),
        self_pickup_id: uuid("self_pickup_id").references((): AnyPgColumn => selfPickups.id, {
            onDelete: "cascade",
        }),
        status: lineItemRequestStatusEnum("status").notNull().default("REQUESTED"),
        description: varchar("description", { length: 200 }).notNull(),
        category: serviceCategoryEnum("category").notNull(),
        quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
        unit: varchar("unit", { length: 20 }).notNull(),
        unit_rate: decimal("unit_rate", { precision: 10, scale: 2 }).notNull(),
        notes: text("notes"),
        requested_by: uuid("requested_by")
            .notNull()
            .references(() => users.id),
        reviewed_description: varchar("reviewed_description", { length: 200 }),
        reviewed_category: serviceCategoryEnum("reviewed_category"),
        reviewed_quantity: decimal("reviewed_quantity", { precision: 10, scale: 2 }),
        reviewed_unit: varchar("reviewed_unit", { length: 20 }),
        reviewed_unit_rate: decimal("reviewed_unit_rate", { precision: 10, scale: 2 }),
        reviewed_notes: text("reviewed_notes"),
        approved_billing_mode: billingModeEnum("approved_billing_mode"),
        admin_note: text("admin_note"),
        resolved_by: uuid("resolved_by").references(() => users.id),
        resolved_at: timestamp("resolved_at"),
        approved_line_item_id: uuid("approved_line_item_id").references(() => lineItems.id),
        created_service_type_id: uuid("created_service_type_id").references(() => serviceTypes.id),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        unique("line_item_requests_platform_request_id_unique").on(
            table.platform_id,
            table.line_item_request_id
        ),
        index("line_item_requests_platform_status_idx").on(
            table.platform_id,
            table.status,
            table.created_at
        ),
        index("line_item_requests_order_idx").on(table.order_id),
        index("line_item_requests_inbound_idx").on(table.inbound_request_id),
        index("line_item_requests_service_idx").on(table.service_request_id),
    ]
);

export const lineItemRequestsRelations = relations(lineItemRequests, ({ one }) => ({
    platform: one(platforms, {
        fields: [lineItemRequests.platform_id],
        references: [platforms.id],
    }),
    company: one(companies, {
        fields: [lineItemRequests.company_id],
        references: [companies.id],
    }),
    order: one(orders, {
        fields: [lineItemRequests.order_id],
        references: [orders.id],
    }),
    inbound_request: one(inboundRequests, {
        fields: [lineItemRequests.inbound_request_id],
        references: [inboundRequests.id],
    }),
    service_request: one(serviceRequests, {
        fields: [lineItemRequests.service_request_id],
        references: [serviceRequests.id],
    }),
    self_pickup: one(selfPickups, {
        fields: [lineItemRequests.self_pickup_id],
        references: [selfPickups.id],
    }),
    requested_by_user: one(users, {
        fields: [lineItemRequests.requested_by],
        references: [users.id],
        relationName: "line_item_request_requested_by_user",
    }),
    resolved_by_user: one(users, {
        fields: [lineItemRequests.resolved_by],
        references: [users.id],
        relationName: "line_item_request_resolved_by_user",
    }),
    approved_line_item: one(lineItems, {
        fields: [lineItemRequests.approved_line_item_id],
        references: [lineItems.id],
    }),
    created_service_type: one(serviceTypes, {
        fields: [lineItemRequests.created_service_type_id],
        references: [serviceTypes.id],
    }),
}));

// ---------------------------------- ORDER STATUS HISTORY ---------------------------------
export const orderStatusHistory = pgTable(
    "order_status_history",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        order_id: uuid("order")
            .notNull()
            .references(() => orders.id, { onDelete: "cascade" }),
        status: orderStatusEnum("status").notNull(),
        notes: text("notes"),
        updated_by: uuid("updated_by")
            .notNull()
            .references(() => users.id),
        timestamp: timestamp("timestamp").notNull().defaultNow(),
    },
    (table) => [index("order_status_history_order_idx").on(table.order_id)]
);

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
    order: one(orders, { fields: [orderStatusHistory.order_id], references: [orders.id] }),
    platform: one(platforms, {
        fields: [orderStatusHistory.platform_id],
        references: [platforms.id],
    }),
    updated_by_user: one(users, {
        fields: [orderStatusHistory.updated_by],
        references: [users.id],
    }),
}));

// ---------------------------------- FINANCIAL STATUS HISTORY ---------------------------------
export const financialStatusHistory = pgTable(
    "financial_status_history",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        order_id: uuid("order")
            .notNull()
            .references(() => orders.id, { onDelete: "cascade" }),
        status: financialStatusEnum("status").notNull(),
        notes: text("notes"),
        updated_by: uuid("updated_by")
            .notNull()
            .references(() => users.id),
        timestamp: timestamp("timestamp").notNull().defaultNow(),
    },
    (table) => [index("financial_status_history_order_idx").on(table.order_id)]
);

export const financialStatusHistoryRelations = relations(financialStatusHistory, ({ one }) => ({
    order: one(orders, { fields: [financialStatusHistory.order_id], references: [orders.id] }),
    platform: one(platforms, {
        fields: [financialStatusHistory.platform_id],
        references: [platforms.id],
    }),
    updated_by_user: one(users, {
        fields: [financialStatusHistory.updated_by],
        references: [users.id],
    }),
}));

// ---------------------------------- INVOICES -------------------------------------------------
export const invoices = pgTable(
    "invoices",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        order_id: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
        inbound_request_id: uuid("inbound_request_id").references(() => inboundRequests.id, {
            onDelete: "cascade",
        }),
        service_request_id: uuid("service_request_id").references(() => serviceRequests.id, {
            onDelete: "cascade",
        }),
        self_pickup_id: uuid("self_pickup_id").references((): AnyPgColumn => selfPickups.id, {
            onDelete: "cascade",
        }),
        type: invoiceTypeEnum("type").notNull(),
        invoice_id: varchar("invoice_id", { length: 50 }).notNull(),
        invoice_pdf_url: varchar("invoice_pdf_url", { length: 255 }).notNull(),
        invoice_paid_at: timestamp("invoice_paid_at"),
        payment_method: varchar("payment_method", { length: 50 }),
        payment_reference: varchar("payment_reference", { length: 100 }),
        generated_by: uuid("generated_by")
            .notNull()
            .references(() => users.id),
        updated_by: uuid("updated_by").references(() => users.id),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("invoices_order_idx").on(table.order_id),
        index("invoices_inbound_request_idx").on(table.inbound_request_id),
        index("invoices_service_request_idx").on(table.service_request_id),
        unique("platform_invoice_id_unique").on(table.platform_id, table.invoice_id),
    ]
);

export const invoicesRelations = relations(invoices, ({ one }) => ({
    order: one(orders, { fields: [invoices.order_id], references: [orders.id] }),
    inbound_request: one(inboundRequests, {
        fields: [invoices.inbound_request_id],
        references: [inboundRequests.id],
    }),
    service_request: one(serviceRequests, {
        fields: [invoices.service_request_id],
        references: [serviceRequests.id],
    }),
    self_pickup: one(selfPickups, {
        fields: [invoices.self_pickup_id],
        references: [selfPickups.id],
    }),
    platform: one(platforms, { fields: [invoices.platform_id], references: [platforms.id] }),
    generated_by_user: one(users, { fields: [invoices.generated_by], references: [users.id] }),
    updated_by_user: one(users, { fields: [invoices.updated_by], references: [users.id] }),
}));

// ---------------------------------- SELF PICKUPS -----------------------------------------
// Self-pickups are the fourth entity in the shared pattern (orders, inbound_requests,
// service_requests, self_pickups). They reuse prices/line_items/invoices/workflow_requests/
// entity_attachments polymorphically via the SELF_PICKUP entity_type value.
export const selfPickups = pgTable(
    "self_pickups",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        // Human-readable ID: SPK-YYYYMMDD-XXX
        self_pickup_id: varchar("self_pickup_id", { length: 20 }).notNull(),
        company_id: uuid("company_id")
            .notNull()
            .references(() => companies.id),
        brand_id: uuid("brand_id").references(() => brands.id),
        created_by: uuid("created_by")
            .notNull()
            .references(() => users.id),
        job_number: varchar("job_number", { length: 50 }),
        po_number: varchar("po_number", { length: 100 }),

        // Collector details (default from current user at checkout, editable)
        collector_name: varchar("collector_name", { length: 100 }).notNull(),
        collector_phone: varchar("collector_phone", { length: 50 }).notNull(),
        collector_email: varchar("collector_email", { length: 255 }),

        // Pickup window — required per brief §4.3
        pickup_window: jsonb("pickup_window").notNull(), // {start, end} datetime

        // Return trigger: auto-transitions PICKED_UP/IN_USE → AWAITING_RETURN when cron
        // sees expected_return_at < now(). Client can also early-trigger via endpoint.
        expected_return_at: timestamp("expected_return_at"),

        // Notes
        notes: text("notes"),
        special_instructions: text("special_instructions"),

        // Pricing — polymorphic reuse via entity_type=SELF_PICKUP on prices table.
        // This FK mirrors orders.order_pricing_id for query convenience.
        self_pickup_pricing_id: uuid("self_pickup_pricing_id")
            .notNull()
            .references(() => prices.id),
        calculated_totals: jsonb("calculated_totals").notNull(),

        // Status
        self_pickup_status: selfPickupStatusEnum("self_pickup_status")
            .notNull()
            .default("SUBMITTED"),
        financial_status: financialStatusEnum("financial_status")
            .notNull()
            .default("PENDING_QUOTE"),

        // Timestamps
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
        deleted_at: timestamp("deleted_at"),
    },
    (table) => [
        unique("self_pickups_platform_self_pickup_id_unique").on(
            table.platform_id,
            table.self_pickup_id
        ),
        index("self_pickups_platform_company_idx").on(table.platform_id, table.company_id),
        index("self_pickups_status_idx").on(table.self_pickup_status),
        index("self_pickups_financial_status_idx").on(table.financial_status),
        index("self_pickups_created_at_idx").on(table.created_at),
    ]
);

export const selfPickupsRelations = relations(selfPickups, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [selfPickups.platform_id],
        references: [platforms.id],
    }),
    company: one(companies, {
        fields: [selfPickups.company_id],
        references: [companies.id],
    }),
    brand: one(brands, { fields: [selfPickups.brand_id], references: [brands.id] }),
    created_by_user: one(users, {
        fields: [selfPickups.created_by],
        references: [users.id],
    }),
    self_pickup_pricing: one(prices, {
        fields: [selfPickups.self_pickup_pricing_id],
        references: [prices.id],
    }),
    items: many(selfPickupItems),
    status_history: many(selfPickupStatusHistory),
    line_items: many(lineItems),
    line_item_requests: many(lineItemRequests),
    invoices: many(invoices),
    asset_bookings: many(assetBookings),
    scan_events: many(scanEvents),
}));

export const selfPickupItems = pgTable(
    "self_pickup_items",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        self_pickup_id: uuid("self_pickup_id")
            .notNull()
            .references(() => selfPickups.id, { onDelete: "cascade" }),
        asset_id: uuid("asset_id")
            .notNull()
            .references(() => assets.id),

        // Snapshot data (mirrors order_items)
        asset_name: varchar("asset_name", { length: 200 }).notNull(),
        quantity: integer("quantity").notNull(),
        volume_per_unit: decimal("volume_per_unit", { precision: 8, scale: 3 }).notNull(),
        weight_per_unit: decimal("weight_per_unit", { precision: 8, scale: 2 }).notNull(),
        total_volume: decimal("total_volume", { precision: 8, scale: 3 }).notNull(),
        total_weight: decimal("total_weight", { precision: 8, scale: 2 }).notNull(),
        condition_notes: text("condition_notes"),
        handling_tags: text("handling_tags")
            .array()
            .default(sql`ARRAY[]::text[]`),

        from_collection: uuid("from_collection").references(() => collections.id),
        from_collection_name: varchar("from_collection_name", { length: 200 }),

        // Settlement — same semantics as order_items.settled_at
        settled_at: timestamp("settled_at"),
        settled_by: uuid("settled_by").references(() => users.id),

        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        index("self_pickup_items_pickup_idx").on(table.self_pickup_id),
        index("self_pickup_items_asset_idx").on(table.asset_id),
        index("self_pickup_items_platform_idx").on(table.platform_id),
    ]
);

export const selfPickupItemsRelations = relations(selfPickupItems, ({ one }) => ({
    platform: one(platforms, {
        fields: [selfPickupItems.platform_id],
        references: [platforms.id],
    }),
    self_pickup: one(selfPickups, {
        fields: [selfPickupItems.self_pickup_id],
        references: [selfPickups.id],
    }),
    asset: one(assets, { fields: [selfPickupItems.asset_id], references: [assets.id] }),
    from_collection: one(collections, {
        fields: [selfPickupItems.from_collection],
        references: [collections.id],
    }),
    settled_by_user: one(users, {
        fields: [selfPickupItems.settled_by],
        references: [users.id],
    }),
}));

export const selfPickupStatusHistory = pgTable(
    "self_pickup_status_history",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        self_pickup_id: uuid("self_pickup_id")
            .notNull()
            .references(() => selfPickups.id, { onDelete: "cascade" }),
        status: selfPickupStatusEnum("status").notNull(),
        notes: text("notes"),
        updated_by: uuid("updated_by")
            .notNull()
            .references(() => users.id),
        timestamp: timestamp("timestamp").notNull().defaultNow(),
    },
    (table) => [index("self_pickup_status_history_pickup_idx").on(table.self_pickup_id)]
);

export const selfPickupStatusHistoryRelations = relations(selfPickupStatusHistory, ({ one }) => ({
    self_pickup: one(selfPickups, {
        fields: [selfPickupStatusHistory.self_pickup_id],
        references: [selfPickups.id],
    }),
    updated_by_user: one(users, {
        fields: [selfPickupStatusHistory.updated_by],
        references: [users.id],
    }),
}));

// ---------------------------------- ASSET BOOKINGS ---------------------------------------
// Polymorphic parent: order_id XOR self_pickup_id. Enforced via CHECK constraint added
// manually to the generated migration SQL (see drizzle/NNNN_redbull_build.sql).
export const assetBookings = pgTable(
    "asset_bookings",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        asset_id: uuid("asset_id")
            .notNull()
            .references(() => assets.id, { onDelete: "cascade" }),
        order_id: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
        self_pickup_id: uuid("self_pickup_id").references(() => selfPickups.id, {
            onDelete: "cascade",
        }),
        quantity: integer("quantity").notNull(),
        blocked_from: timestamp("blocked_from", { mode: "date" }).notNull(),
        blocked_until: timestamp("blocked_until", { mode: "date" }).notNull(),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("asset_bookings_dates_idx").on(table.blocked_from, table.blocked_until),
        index("asset_bookings_self_pickup_idx").on(table.self_pickup_id),
    ]
);

export const assetBookingsRelations = relations(assetBookings, ({ one }) => ({
    asset: one(assets, { fields: [assetBookings.asset_id], references: [assets.id] }),
    order: one(orders, { fields: [assetBookings.order_id], references: [orders.id] }),
    self_pickup: one(selfPickups, {
        fields: [assetBookings.self_pickup_id],
        references: [selfPickups.id],
    }),
}));

// ---------------------------------- SELF BOOKINGS ----------------------------------------
export const selfBookingStatusEnum = pgEnum("self_booking_status", [
    "ACTIVE",
    "COMPLETED",
    "CANCELLED",
]);
export const selfBookingItemStatusEnum = pgEnum("self_booking_item_status", ["OUT", "RETURNED"]);

export const selfBookings = pgTable("self_bookings", {
    id: uuid("id").primaryKey().defaultRandom(),
    platform_id: uuid("platform_id")
        .notNull()
        .references(() => platforms.id, { onDelete: "cascade" }),
    booked_for: varchar("booked_for", { length: 255 }).notNull(),
    reason: text("reason"),
    job_reference: varchar("job_reference", { length: 255 }),
    status: selfBookingStatusEnum("status").notNull().default("ACTIVE"),
    created_by: uuid("created_by")
        .notNull()
        .references(() => users.id),
    completed_at: timestamp("completed_at"),
    cancelled_at: timestamp("cancelled_at"),
    cancelled_by: uuid("cancelled_by").references(() => users.id),
    cancellation_reason: text("cancellation_reason"),
    notes: text("notes"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at")
        .$onUpdate(() => new Date())
        .notNull(),
});

export const selfBookingsRelations = relations(selfBookings, ({ one, many }) => ({
    platform: one(platforms, { fields: [selfBookings.platform_id], references: [platforms.id] }),
    created_by_user: one(users, {
        fields: [selfBookings.created_by],
        references: [users.id],
        relationName: "self_booking_creator",
    }),
    cancelled_by_user: one(users, {
        fields: [selfBookings.cancelled_by],
        references: [users.id],
        relationName: "self_booking_canceller",
    }),
    items: many(selfBookingItems),
}));

export const selfBookingItems = pgTable("self_booking_items", {
    id: uuid("id").primaryKey().defaultRandom(),
    self_booking_id: uuid("self_booking_id")
        .notNull()
        .references(() => selfBookings.id, { onDelete: "cascade" }),
    asset_id: uuid("asset_id")
        .notNull()
        .references(() => assets.id),
    quantity: integer("quantity").notNull(),
    returned_quantity: integer("returned_quantity").notNull().default(0),
    status: selfBookingItemStatusEnum("status").notNull().default("OUT"),
    returned_at: timestamp("returned_at"),
    created_at: timestamp("created_at").notNull().defaultNow(),
});

export const selfBookingItemsRelations = relations(selfBookingItems, ({ one }) => ({
    self_booking: one(selfBookings, {
        fields: [selfBookingItems.self_booking_id],
        references: [selfBookings.id],
    }),
    asset: one(assets, { fields: [selfBookingItems.asset_id], references: [assets.id] }),
}));

// ---------------------------------- ASSET CONDITION HISTORY ------------------------------
export const assetConditionHistory = pgTable(
    "asset_condition_history",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        // Multi-tenancy: Strictly scoped to platform
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        asset_id: uuid("asset")
            .notNull()
            .references(() => assets.id, { onDelete: "cascade" }),

        condition: assetConditionEnum("condition").notNull(),
        notes: text("notes"),
        photos: text("photos")
            .array()
            .notNull()
            .default(sql`ARRAY[]::text[]`),
        damage_report_entries: jsonb("damage_report_entries")
            .notNull()
            .default(sql`'[]'::jsonb`),

        updated_by: uuid("updated_by")
            .notNull()
            .references(() => users.id),
        timestamp: timestamp("timestamp").notNull().defaultNow(),
    },
    (table) => [
        index("asset_condition_history_asset_idx").on(table.asset_id),
        index("asset_condition_history_platform_idx").on(table.platform_id),
    ]
);

export const assetConditionHistoryRelations = relations(assetConditionHistory, ({ one }) => ({
    asset: one(assets, { fields: [assetConditionHistory.asset_id], references: [assets.id] }),
    platform: one(platforms, {
        fields: [assetConditionHistory.platform_id],
        references: [platforms.id],
    }),
    updated_by_user: one(users, {
        fields: [assetConditionHistory.updated_by],
        references: [users.id],
    }),
}));

// ---------------------------------- SCAN EVENTS ------------------------------------------
// Polymorphic parent: order_id XOR self_pickup_id. Derig/truck-photo/onsite scan types are
// application-level restricted to order_id only (not a DB CHECK — enforced in the scanning
// service wrapper). CHECK constraint for parent exclusivity is added manually to the
// generated migration SQL.
export const scanEvents = pgTable("scan_events", {
    id: uuid("id").primaryKey().defaultRandom(),
    order_id: uuid("order").references(() => orders.id, { onDelete: "cascade" }),
    self_pickup_id: uuid("self_pickup_id").references(() => selfPickups.id, {
        onDelete: "cascade",
    }),
    asset_id: uuid("asset").references(() => assets.id),
    scan_type: scanTypeEnum("scan_type").notNull(),
    quantity: integer("quantity").notNull().default(0),
    condition: assetConditionEnum("condition"),
    notes: text("notes"),
    discrepancy_reason: discrepancyReasonEnum("discrepancy_reason"),
    metadata: jsonb("metadata")
        .notNull()
        .default(sql`'{}'::jsonb`),
    scanned_by: uuid("scanned_by").references(() => users.id),
    scanned_at: timestamp("scanned_at").notNull().defaultNow(),
});

export const scanEventsRelations = relations(scanEvents, ({ one, many }) => ({
    order: one(orders, { fields: [scanEvents.order_id], references: [orders.id] }),
    self_pickup: one(selfPickups, {
        fields: [scanEvents.self_pickup_id],
        references: [selfPickups.id],
    }),
    asset: one(assets, { fields: [scanEvents.asset_id], references: [assets.id] }),
    scanned_by_user: one(users, { fields: [scanEvents.scanned_by], references: [users.id] }),
    event_assets: many(scanEventAssets),
    event_media: many(scanEventMedia),
}));

export const scanEventAssets = pgTable(
    "scan_event_assets",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        scan_event_id: uuid("scan_event_id")
            .notNull()
            .references(() => scanEvents.id, { onDelete: "cascade" }),
        asset_id: uuid("asset_id")
            .notNull()
            .references(() => assets.id, { onDelete: "cascade" }),
        quantity: integer("quantity").notNull().default(1),
        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        unique("scan_event_assets_event_asset_unique").on(table.scan_event_id, table.asset_id),
        index("scan_event_assets_event_idx").on(table.scan_event_id),
        index("scan_event_assets_asset_idx").on(table.asset_id),
    ]
);

export const scanEventAssetsRelations = relations(scanEventAssets, ({ one }) => ({
    scan_event: one(scanEvents, {
        fields: [scanEventAssets.scan_event_id],
        references: [scanEvents.id],
    }),
    asset: one(assets, { fields: [scanEventAssets.asset_id], references: [assets.id] }),
}));

export const scanEventMedia = pgTable(
    "scan_event_media",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        scan_event_id: uuid("scan_event_id")
            .notNull()
            .references(() => scanEvents.id, { onDelete: "cascade" }),
        url: text("url").notNull(),
        note: text("note"),
        media_kind: varchar("media_kind", { length: 32 }).notNull().default("GENERAL"),
        sort_order: integer("sort_order").notNull().default(0),
        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        index("scan_event_media_event_idx").on(table.scan_event_id),
        index("scan_event_media_kind_idx").on(table.media_kind),
    ]
);

export const scanEventMediaRelations = relations(scanEventMedia, ({ one }) => ({
    scan_event: one(scanEvents, {
        fields: [scanEventMedia.scan_event_id],
        references: [scanEvents.id],
    }),
}));

// ---------------------------------- SYSTEM EVENTS ----------------------------------------
// Purpose: Immutable record of significant things that happened in the system
export const systemEvents = pgTable(
    "system_events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),

        event_type: varchar("event_type", { length: 100 }).notNull(),

        entity_type: entityTypeEnum("entity_type").notNull(),
        entity_id: uuid("entity_id").notNull(),

        actor_id: uuid("actor_id").references(() => users.id),
        actor_role: varchar("actor_role", { length: 20 }),

        payload: jsonb("payload").notNull().default({}),

        occurred_at: timestamp("occurred_at").notNull().defaultNow(),
        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        index("system_events_platform_idx").on(table.platform_id),
        index("system_events_event_type_idx").on(table.event_type),
        index("system_events_entity_idx").on(table.entity_type, table.entity_id),
        index("system_events_occurred_at_idx").on(table.occurred_at),
    ]
);

export const systemEventsRelations = relations(systemEvents, ({ one, many }) => ({
    platform: one(platforms, { fields: [systemEvents.platform_id], references: [platforms.id] }),
    actor: one(users, { fields: [systemEvents.actor_id], references: [users.id] }),
    notification_logs: many(notificationLogs),
}));

// ---------------------------------- NOTIFICATION RULES -----------------------------------
// Purpose: Configurable rules — who gets emailed for each event type
export const notificationRules = pgTable(
    "notification_rules",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),

        event_type: varchar("event_type", { length: 100 }).notNull(),

        company_id: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),

        recipient_type: recipientTypeEnum("recipient_type").notNull(),
        recipient_value: varchar("recipient_value", { length: 255 }),

        template_key: varchar("template_key", { length: 100 }).notNull(),
        conditions: jsonb("conditions")
            .notNull()
            .default(sql`'[]'::jsonb`),

        is_enabled: boolean("is_enabled").notNull().default(true),
        sort_order: integer("sort_order").notNull().default(0),

        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => [
        index("notification_rules_platform_event_idx").on(table.platform_id, table.event_type),
        index("notification_rules_company_idx").on(table.company_id),
    ]
);

export const notificationRulesRelations = relations(notificationRules, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [notificationRules.platform_id],
        references: [platforms.id],
    }),
    company: one(companies, { fields: [notificationRules.company_id], references: [companies.id] }),
    notification_logs: many(notificationLogs),
}));

// ---------------------------------- NOTIFICATION LOGS ------------------------------------
// Purpose: One row per email sent — per-recipient delivery tracking
export const notificationLogs = pgTable(
    "notification_logs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),

        event_id: uuid("event_id")
            .notNull()
            .references(() => systemEvents.id, { onDelete: "cascade" }),
        rule_id: uuid("rule_id").references(() => notificationRules.id, { onDelete: "set null" }),

        recipient_email: varchar("recipient_email", { length: 255 }).notNull(),
        recipient_type: recipientTypeEnum("recipient_type").notNull(),
        recipient_value: varchar("recipient_value", { length: 255 }),

        template_key: varchar("template_key", { length: 100 }).notNull(),
        subject: varchar("subject", { length: 500 }),

        status: notificationStatusEnum("status").notNull().default("QUEUED"),
        attempts: integer("attempts").notNull().default(0),
        next_attempt_at: timestamp("next_attempt_at"),
        last_attempt_at: timestamp("last_attempt_at"),
        processing_started_at: timestamp("processing_started_at"),
        sent_at: timestamp("sent_at"),
        message_id: varchar("message_id", { length: 255 }),
        worker_id: varchar("worker_id", { length: 255 }),
        error_message: text("error_message"),

        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        index("notification_logs_event_idx").on(table.event_id),
        index("notification_logs_status_idx").on(table.status),
        index("notification_logs_queue_idx").on(
            table.status,
            table.next_attempt_at,
            table.created_at
        ),
        index("notification_logs_recipient_idx").on(table.recipient_email),
        index("notification_logs_created_at_idx").on(table.created_at),
    ]
);

export const notificationLogsRelations = relations(notificationLogs, ({ one }) => ({
    platform: one(platforms, {
        fields: [notificationLogs.platform_id],
        references: [platforms.id],
    }),
    event: one(systemEvents, {
        fields: [notificationLogs.event_id],
        references: [systemEvents.id],
    }),
    rule: one(notificationRules, {
        fields: [notificationLogs.rule_id],
        references: [notificationRules.id],
    }),
}));

export const emailSuppressions = pgTable(
    "email_suppressions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        email: varchar("email", { length: 255 }).notNull(),
        reason: varchar("reason", { length: 100 }).notNull().default("UNSUBSCRIBED"),
        unsubscribed_at: timestamp("unsubscribed_at").notNull().defaultNow(),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull()
            .defaultNow(),
    },
    (table) => [
        uniqueIndex("email_suppressions_platform_email_idx").on(table.platform_id, table.email),
        index("email_suppressions_email_idx").on(table.email),
    ]
);

export const emailSuppressionsRelations = relations(emailSuppressions, ({ one }) => ({
    platform: one(platforms, {
        fields: [emailSuppressions.platform_id],
        references: [platforms.id],
    }),
}));

// ---------------------------------- OTP --------------------------------------------------
export const otp = pgTable(
    "otp",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        email: varchar("email", { length: 255 }).notNull(),
        otp: varchar("otp", { length: 6 }).notNull(),
        expires_at: timestamp("expires_at").notNull(),
        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        index("otp_email_idx").on(table.email),
        index("otp_platform_idx").on(table.platform_id),
    ]
);

// ---------------------------------- COUNTRY ----------------------------------------------
export const countries = pgTable(
    "countries",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 100 }).notNull(),
        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        index("countries_platform_idx").on(table.platform_id),
        unique("countries_platform_name_unique").on(table.platform_id, table.name), // Country name must be unique within a platform
    ]
);

export const countriesRelations = relations(countries, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [countries.platform_id],
        references: [platforms.id],
    }),
    cities: many(cities),
}));

// ---------------------------------- CITY -------------------------------------------------
export const cities = pgTable(
    "cities",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        name: varchar("name", { length: 255 }).notNull(),
        country_id: uuid("country_id")
            .notNull()
            .references(() => countries.id, { onDelete: "cascade" }),
        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        index("cities_platform_idx").on(table.platform_id),
        index("cities_country_idx").on(table.country_id),
        unique("cities_platform_country_name_unique").on(
            table.platform_id,
            table.country_id,
            table.name
        ), // City name must be unique within a platform and country
    ]
);

export const citiesRelations = relations(cities, ({ one }) => ({
    platform: one(platforms, {
        fields: [cities.platform_id],
        references: [platforms.id],
    }),
    country: one(countries, {
        fields: [cities.country_id],
        references: [countries.id],
    }),
}));

// ---------------------------------- ORDER PRICES -----------------------------------------
export const prices = pgTable(
    "prices",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        entity_type: invoiceTypeEnum("entity_type").notNull(),
        entity_id: uuid("entity_id").notNull(),
        breakdown_lines: jsonb("breakdown_lines")
            .notNull()
            .default(sql`'[]'::jsonb`),
        margin_percent: decimal("margin_percent", { precision: 5, scale: 2 })
            .notNull()
            .default("0"),
        vat_percent: decimal("vat_percent", { precision: 5, scale: 2 }).notNull().default("0"),
        margin_is_override: boolean("margin_is_override").notNull().default(false),
        margin_override_reason: text("margin_override_reason"),
        calculated_at: timestamp("calculated_at").notNull().defaultNow(),
        calculated_by: uuid("calculated_by")
            .notNull()
            .references(() => users.id),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("order_prices_platform_idx").on(table.platform_id),
        index("prices_entity_lookup_idx").on(table.platform_id, table.entity_type, table.entity_id),
        unique("prices_platform_entity_unique").on(
            table.platform_id,
            table.entity_type,
            table.entity_id
        ),
    ]
);

export const orderPricesRelations = relations(prices, ({ one }) => ({
    platform: one(platforms, {
        fields: [prices.platform_id],
        references: [platforms.id],
    }),
}));

// ---------------------------------- INBOUND REQUEST --------------------------------------
export const inboundRequests = pgTable("inbound_requests", {
    id: uuid("id").primaryKey().defaultRandom(),
    inbound_request_id: varchar("inbound_request_id", { length: 20 }).notNull(), // Human-readable ID (IR-YYYYMMDD-XXX)
    platform_id: uuid("platform_id")
        .notNull()
        .references(() => platforms.id, { onDelete: "cascade" }),
    company_id: uuid("company_id")
        .notNull()
        .references(() => companies.id, { onDelete: "cascade" }),
    created_by: uuid("created_by")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    incoming_at: timestamp("incoming_at").notNull(),
    note: text("note"),
    request_status: inboundRequestStatusEnum("request_status").notNull().default("PRICING_REVIEW"),
    financial_status: financialStatusEnum("financial_status").notNull().default("PENDING_QUOTE"),
    request_pricing_id: uuid("request_pricing_id")
        .notNull()
        .references(() => prices.id),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at")
        .$onUpdate(() => new Date())
        .notNull(),
});

export const inboundRequestsRelations = relations(inboundRequests, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [inboundRequests.platform_id],
        references: [platforms.id],
    }),
    company: one(companies, {
        fields: [inboundRequests.company_id],
        references: [companies.id],
    }),
    created_by_user: one(users, {
        fields: [inboundRequests.created_by],
        references: [users.id],
    }),
    request_pricing: one(prices, {
        fields: [inboundRequests.request_pricing_id],
        references: [prices.id],
    }),
    items: many(inboundRequestItems),
    line_items: many(lineItems),
    line_item_requests: many(lineItemRequests),
    workflow_requests: many(workflowRequests),
    attachments: many(entityAttachments),
}));

// ---------------------------------- INBOUND REQUEST ITEM ---------------------------------
export const inboundRequestItems = pgTable("inbound_request_items", {
    id: uuid("id").primaryKey().defaultRandom(),
    inbound_request_id: uuid("inbound_request_id")
        .notNull()
        .references(() => inboundRequests.id, { onDelete: "cascade" }),
    brand_id: uuid("brand_id").references(() => brands.id),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 100 }).notNull(),
    tracking_method: trackingMethodEnum("tracking_method").notNull(),
    quantity: integer("quantity").notNull().default(1),
    packaging: varchar("packaging", { length: 100 }),
    weight_per_unit: decimal("weight_per_unit", { precision: 8, scale: 2 }).notNull(), // in kilograms
    dimensions: jsonb("dimensions").default({}).notNull(), // {length, width, height} in cm
    volume_per_unit: decimal("volume_per_unit", { precision: 8, scale: 3 }).notNull(), // in cubic meters
    handling_tags: text("handling_tags")
        .array()
        .notNull()
        .default(sql`ARRAY[]::text[]`),
    images: text("images")
        .array()
        .default(sql`ARRAY[]::text[]`),
    asset_id: uuid("asset_id").references(() => assets.id),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at")
        .$onUpdate(() => new Date())
        .notNull(),
});

// ---------------------------------- ASSET VERSIONS -----------------------------------------
export const assetVersions = pgTable(
    "asset_versions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        asset_id: uuid("asset_id")
            .notNull()
            .references(() => assets.id, { onDelete: "cascade" }),
        version_number: integer("version_number").notNull(),
        reason: varchar("reason", { length: 100 }).notNull(),
        order_id: uuid("order_id").references(() => orders.id),
        snapshot: jsonb("snapshot").notNull(),
        created_by: uuid("created_by")
            .notNull()
            .references(() => users.id),
        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        index("asset_versions_asset_idx").on(table.asset_id),
        index("asset_versions_asset_version_idx").on(table.asset_id, table.version_number),
    ]
);

export const assetVersionsRelations = relations(assetVersions, ({ one }) => ({
    platform: one(platforms, { fields: [assetVersions.platform_id], references: [platforms.id] }),
    asset: one(assets, { fields: [assetVersions.asset_id], references: [assets.id] }),
    order: one(orders, { fields: [assetVersions.order_id], references: [orders.id] }),
    created_by_user: one(users, { fields: [assetVersions.created_by], references: [users.id] }),
}));

export const inboundRequestItemsRelations = relations(inboundRequestItems, ({ one }) => ({
    inbound_request: one(inboundRequests, {
        fields: [inboundRequestItems.inbound_request_id],
        references: [inboundRequests.id],
    }),
    brand: one(brands, {
        fields: [inboundRequestItems.brand_id],
        references: [brands.id],
    }),
    created_asset: one(assets, {
        fields: [inboundRequestItems.asset_id],
        references: [assets.id],
    }),
}));

export const serviceRequests = pgTable(
    "service_requests",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        service_request_id: varchar("service_request_id", { length: 24 }).notNull(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id),
        company_id: uuid("company_id")
            .notNull()
            .references(() => companies.id),
        request_type: serviceRequestTypeEnum("request_type").notNull(),
        billing_mode: serviceRequestBillingModeEnum("billing_mode")
            .notNull()
            .default("INTERNAL_ONLY"),
        link_mode: serviceRequestLinkModeEnum("link_mode").notNull().default("STANDALONE"),
        blocks_fulfillment: boolean("blocks_fulfillment").notNull().default(false),
        request_status: serviceRequestStatusEnum("request_status").notNull().default("DRAFT"),
        commercial_status: serviceRequestCommercialStatusEnum("commercial_status")
            .notNull()
            .default("INTERNAL"),
        title: varchar("title", { length: 200 }).notNull(),
        description: text("description"),
        related_asset_id: uuid("related_asset_id").references(() => assets.id),
        related_order_id: uuid("related_order_id").references(() => orders.id),
        related_order_item_id: uuid("related_order_item_id").references(() => orderItems.id),
        request_pricing_id: uuid("request_pricing_id").references(() => prices.id),
        client_sell_override_total: decimal("client_sell_override_total", {
            precision: 12,
            scale: 2,
        }),
        concession_reason: text("concession_reason"),
        concession_approved_by: uuid("concession_approved_by").references(() => users.id),
        concession_applied_at: timestamp("concession_applied_at"),
        requested_start_at: timestamp("requested_start_at"),
        requested_due_at: timestamp("requested_due_at"),
        created_by: uuid("created_by")
            .notNull()
            .references(() => users.id),
        completed_at: timestamp("completed_at"),
        completed_by: uuid("completed_by").references(() => users.id),
        completion_notes: text("completion_notes"),
        photos: text("photos")
            .array()
            .notNull()
            .default(sql`ARRAY[]::text[]`),
        work_notes: text("work_notes"),
        cancelled_at: timestamp("cancelled_at"),
        cancelled_by: uuid("cancelled_by").references(() => users.id),
        cancellation_reason: text("cancellation_reason"),
        created_at: timestamp("created_at").defaultNow().notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => [
        unique("service_requests_request_id_unique").on(
            table.platform_id,
            table.service_request_id
        ),
        index("service_requests_platform_idx").on(table.platform_id),
        index("service_requests_company_idx").on(table.company_id),
        index("service_requests_status_idx").on(table.request_status),
        index("service_requests_commercial_status_idx").on(table.commercial_status),
    ]
);

export const serviceRequestItems = pgTable(
    "service_request_items",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        service_request_id: uuid("service_request_id")
            .notNull()
            .references(() => serviceRequests.id, { onDelete: "cascade" }),
        asset_id: uuid("asset_id").references(() => assets.id),
        asset_name: varchar("asset_name", { length: 200 }).notNull(),
        quantity: integer("quantity").notNull().default(1),
        notes: text("notes"),
        refurb_days_estimate: integer("refurb_days_estimate"),
        created_at: timestamp("created_at").defaultNow().notNull(),
        updated_at: timestamp("updated_at").defaultNow().notNull(),
    },
    (table) => [
        index("service_request_items_request_idx").on(table.service_request_id),
        index("service_request_items_asset_idx").on(table.asset_id),
    ]
);

export const serviceRequestStatusHistory = pgTable(
    "service_request_status_history",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        service_request_id: uuid("service_request_id")
            .notNull()
            .references(() => serviceRequests.id, { onDelete: "cascade" }),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id),
        from_status: serviceRequestStatusEnum("from_status"),
        to_status: serviceRequestStatusEnum("to_status").notNull(),
        note: text("note"),
        changed_by: uuid("changed_by")
            .notNull()
            .references(() => users.id),
        changed_at: timestamp("changed_at").defaultNow().notNull(),
    },
    (table) => [
        index("service_request_history_request_idx").on(table.service_request_id),
        index("service_request_history_platform_idx").on(table.platform_id),
    ]
);

export const serviceRequestsRelations = relations(serviceRequests, ({ one, many }) => ({
    platform: one(platforms, { fields: [serviceRequests.platform_id], references: [platforms.id] }),
    company: one(companies, { fields: [serviceRequests.company_id], references: [companies.id] }),
    related_asset: one(assets, {
        fields: [serviceRequests.related_asset_id],
        references: [assets.id],
    }),
    related_order: one(orders, {
        fields: [serviceRequests.related_order_id],
        references: [orders.id],
    }),
    related_order_item: one(orderItems, {
        fields: [serviceRequests.related_order_item_id],
        references: [orderItems.id],
    }),
    request_pricing: one(prices, {
        fields: [serviceRequests.request_pricing_id],
        references: [prices.id],
    }),
    created_by_user: one(users, {
        fields: [serviceRequests.created_by],
        references: [users.id],
        relationName: "service_request_created_by_user",
    }),
    completed_by_user: one(users, {
        fields: [serviceRequests.completed_by],
        references: [users.id],
        relationName: "service_request_completed_by_user",
    }),
    cancelled_by_user: one(users, {
        fields: [serviceRequests.cancelled_by],
        references: [users.id],
        relationName: "service_request_cancelled_by_user",
    }),
    concession_approved_by_user: one(users, {
        fields: [serviceRequests.concession_approved_by],
        references: [users.id],
        relationName: "service_request_concession_approved_by_user",
    }),
    line_items: many(lineItems),
    line_item_requests: many(lineItemRequests),
    workflow_requests: many(workflowRequests),
    attachments: many(entityAttachments),
    invoices: many(invoices),
    items: many(serviceRequestItems),
    status_history: many(serviceRequestStatusHistory),
}));

export const serviceRequestItemsRelations = relations(serviceRequestItems, ({ one }) => ({
    service_request: one(serviceRequests, {
        fields: [serviceRequestItems.service_request_id],
        references: [serviceRequests.id],
    }),
    asset: one(assets, {
        fields: [serviceRequestItems.asset_id],
        references: [assets.id],
    }),
}));

export const serviceRequestStatusHistoryRelations = relations(
    serviceRequestStatusHistory,
    ({ one }) => ({
        service_request: one(serviceRequests, {
            fields: [serviceRequestStatusHistory.service_request_id],
            references: [serviceRequests.id],
        }),
        platform: one(platforms, {
            fields: [serviceRequestStatusHistory.platform_id],
            references: [platforms.id],
        }),
        changed_by_user: one(users, {
            fields: [serviceRequestStatusHistory.changed_by],
            references: [users.id],
        }),
    })
);

// ---------------------------------- STOCK MOVEMENTS --------------------------------------
// Audit ledger for pooled inventory changes. Every mutation of asset quantity/availability
// that happens through scanning, settlement, or manual adjustment writes a row here.
// v1 scope: linked_entity_type is ORDER only. Inbound requests and service requests are
// excluded for now (those entities are feature-flagged off across all clients and pending
// a future refactor). See the Red Bull build plan for details.
export const stockMovements = pgTable(
    "stock_movements",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        // Either asset_id or asset_family_id (or both) — asset_id is set for serialized/batch
        // movements, asset_family_id for family-level aggregates.
        asset_id: uuid("asset_id").references(() => assets.id, { onDelete: "set null" }),
        asset_family_id: uuid("asset_family_id").references(() => assetFamilies.id, {
            onDelete: "set null",
        }),
        delta: integer("delta").notNull(), // positive (stock in) or negative (stock out)
        movement_type: stockMovementTypeEnum("movement_type").notNull(),
        write_off_reason: stockWriteOffReasonEnum("write_off_reason"), // only when movement_type = WRITE_OFF
        note: text("note"),
        linked_entity_type: varchar("linked_entity_type", { length: 20 }), // "ORDER", "SELF_PICKUP"
        linked_entity_id: uuid("linked_entity_id"),
        linked_scan_event_id: uuid("linked_scan_event_id").references(() => scanEvents.id, {
            onDelete: "set null",
        }),
        created_by: uuid("created_by")
            .notNull()
            .references(() => users.id),
        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        index("stock_movements_asset_idx").on(table.asset_id),
        index("stock_movements_family_idx").on(table.asset_family_id),
        index("stock_movements_linked_entity_idx").on(
            table.linked_entity_type,
            table.linked_entity_id
        ),
        index("stock_movements_platform_idx").on(table.platform_id),
        index("stock_movements_created_at_idx").on(table.created_at),
    ]
);

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
    platform: one(platforms, {
        fields: [stockMovements.platform_id],
        references: [platforms.id],
    }),
    asset: one(assets, { fields: [stockMovements.asset_id], references: [assets.id] }),
    asset_family: one(assetFamilies, {
        fields: [stockMovements.asset_family_id],
        references: [assetFamilies.id],
    }),
    scan_event: one(scanEvents, {
        fields: [stockMovements.linked_scan_event_id],
        references: [scanEvents.id],
    }),
    created_by_user: one(users, {
        fields: [stockMovements.created_by],
        references: [users.id],
    }),
}));
