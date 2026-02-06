import { relations, sql } from "drizzle-orm";
import {
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

export const permissionTemplateEnum = pgEnum("permission_template", [
    "PLATFORM_ADMIN",
    "LOGISTICS_STAFF",
    "CLIENT_USER",
]);

export const hostnameTypeEnum = pgEnum("hostname_type", ["VANITY", "CUSTOM"]);

export const trackingMethodEnum = pgEnum("tracking_method", ["INDIVIDUAL", "BATCH"]);
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
    "AWAITING_FABRICATION",
    "IN_PREPARATION",
    "READY_FOR_DELIVERY",
    "IN_TRANSIT",
    "DELIVERED",
    "IN_USE",
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
    "COMPLETED"
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
    "SENT",
    "FAILED",
    "RETRYING",
]);
export const scanTypeEnum = pgEnum("scan_type", ["OUTBOUND", "INBOUND"]);
export const discrepancyReasonEnum = pgEnum("discrepancy_reason", ["BROKEN", "LOST", "OTHER"]);
export const tripTypeEnum = pgEnum("trip_type", ["ONE_WAY", "ROUND_TRIP"]);
export const lineItemTypeEnum = pgEnum("line_item_type", ["CATALOG", "CUSTOM"]);
export const serviceCategoryEnum = pgEnum("service_category", [
    "ASSEMBLY",
    "EQUIPMENT",
    "HANDLING",
    "RESKIN",
    "OTHER",
]);

export const invoiceTypeEnum = pgEnum("invoice_type", ["ORDER", "INBOUND_REQUEST"]);

// ---------------------------------- PLATFORM -------------------------------------------
// Config structure:
// {
//   "logo_url": "https://...",
//   "primary_color": "#000000",
//   "secondary_color": "#ffffff",
//   "logistics_partner_name": "A2 Logistics",
//   "support_email": "support@platform.com",
//   "currency": "AED"
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
    warehouses: many(warehouses)
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
        warehouse_ops_rate: decimal("warehouse_ops_rate", { precision: 10, scale: 2 }).notNull().default("25.20"), // AED per m³
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
        is_verified: boolean("is_verified").default(false),
        is_active: boolean("is_active").default(true),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index("company_domains_hostname_idx").on(table.hostname)]
);

export const companiesRelations = relations(companies, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [companies.platform_id],
        references: [platforms.id],
    }),
    domains: many(companyDomains),
    brands: many(brands),
    zones: many(zones),
    assets: many(assets),
    collections: many(collections),
    orders: many(orders),
    users: many(users),
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
        permission_template: permissionTemplateEnum("permission_template"),
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
        name: varchar("name", { length: 200 }).notNull(),
        description: text("description"),
        category: varchar("category", { length: 100 }).notNull(),
        images: text("images")
            .array()
            .notNull()
            .default(sql`ARRAY[]::text[]`),
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
        condition_history: jsonb("condition_history").default([]),
        handling_tags: text("handling_tags")
            .array()
            .notNull()
            .default(sql`ARRAY[]::text[]`),
        status: assetStatusEnum("status").notNull().default("AVAILABLE"),
        last_scanned_at: timestamp("last_scanned_at"),
        last_scanned_by: uuid("last_scanned_by").references(() => users.id),

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
    warehouse: one(warehouses, { fields: [assets.warehouse_id], references: [warehouses.id] }),
    zone: one(zones, { fields: [assets.zone_id], references: [zones.id] }),
    last_scanned_by_user: one(users, { fields: [assets.last_scanned_by], references: [users.id] }),
    collection_items: many(collectionItems),
    order_items: many(orderItems),
    scan_events: many(scanEvents),
    bookings: many(assetBookings),
    reskin_requests_as_original: many(reskinRequests, { relationName: "original_asset" }),
    reskin_requests_as_new: many(reskinRequests, { relationName: "new_asset" }),
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
    (table) => [index("collections_company_idx").on(table.company_id)]
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

// ---------------------------------- TRANSPORT RATES (NEW) ------------------------------------
export const transportRates = pgTable(
    "transport_rates",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        company_id: uuid("company").references(() => companies.id, { onDelete: "cascade" }), // NULL = platform-wide
        city_id: uuid("city_id").notNull().references(() => cities.id, { onDelete: "cascade" }),
        area: varchar("area", { length: 100 }), // Optional sub-region
        trip_type: tripTypeEnum("trip_type").notNull(),
        vehicle_type_id: uuid("vehicle_type_id").notNull().references(() => vehicleTypes.id, { onDelete: "cascade" }),
        rate: decimal("rate", { precision: 10, scale: 2 }).notNull(), // AED
        is_active: boolean("is_active").notNull().default(true),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        unique("transport_rates_unique").on(
            table.platform_id,
            table.company_id,
            table.city_id,
            table.area,
            table.trip_type,
        ),
        index("transport_rates_lookup_idx").on(
            table.platform_id,
            table.city_id,
            table.trip_type,
        ),
        index("transport_rates_company_idx").on(table.company_id),
    ]
);

export const transportRatesRelations = relations(transportRates, ({ one }) => ({
    platform: one(platforms, { fields: [transportRates.platform_id], references: [platforms.id] }),
    company: one(companies, { fields: [transportRates.company_id], references: [companies.id] }),
    vehicle_type: one(vehicleTypes, { fields: [transportRates.vehicle_type_id], references: [vehicleTypes.id] }),
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
        user_id: uuid("user_id")
            .notNull()
            .references(() => users.id),
        job_number: varchar("job_number", { length: 50 }),

        // Contact information
        contact_name: varchar("contact_name", { length: 100 }).notNull(),
        contact_email: varchar("contact_email", { length: 255 }).notNull(),
        contact_phone: varchar("contact_phone", { length: 50 }).notNull(),

        // Event details
        event_start_date: timestamp("event_start_date", { mode: "date" }).notNull(),
        event_end_date: timestamp("event_end_date", { mode: "date" }).notNull(),
        venue_name: varchar("venue_name", { length: 200 }).notNull(),
        venue_city_id: uuid("venue_city_id").notNull().references(() => cities.id),
        venue_location: jsonb("venue_location").notNull(), // {country, city, address, access_notes}
        special_instructions: text("special_instructions"),

        // Logistics windows
        delivery_window: jsonb("delivery_window"), // {start, end} datetime
        pickup_window: jsonb("pickup_window"), // {start, end} datetime

        // Calculations
        calculated_totals: jsonb("calculated_totals").notNull(), // {volume, weight} totals

        // Transport (NEW)
        trip_type: tripTypeEnum("trip_type").notNull().default("ROUND_TRIP"),
        vehicle_type_id: uuid("vehicle_type_id").notNull().references(() => vehicleTypes.id),

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
        truck_photos: text("truck_photos")
            .array()
            .default(sql`ARRAY[]::text[]`), // Outbound truck loading photos

        // Logistics details
        delivery_truck_details: jsonb("logistics_delivery_details").default("{}"), // { truck_plate: "ABC-1234", driver_name: "Ahmed", driver_contact: "+971501234567", truck_size: "3_TON", tailgate_required: true, manpower_required: true, notes: "Call 30 min before" }
        pickup_truck_details: jsonb("logistics_pickup_details").default("{}"), // { truck_plate: "ABC-1234", driver_name: "Ahmed", driver_contact: "+971501234567", truck_size: "3_TON", tailgate_required: true, manpower_required: true, notes: "Call 30 min before" }

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
    user: one(users, { fields: [orders.user_id], references: [users.id] }),
    order_pricing: one(prices, { fields: [orders.order_pricing_id], references: [prices.id] }),
    venue_city: one(cities, { fields: [orders.venue_city_id], references: [cities.id] }),
    vehicle_type: one(vehicleTypes, { fields: [orders.vehicle_type_id], references: [vehicleTypes.id] }),
    items: many(orderItems),
    line_items: many(lineItems),
    reskin_requests: many(reskinRequests),
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

        // Reskin request fields (NEW)
        is_reskin_request: boolean("is_reskin_request").notNull().default(false),
        reskin_target_brand_id: uuid("reskin_target_brand").references(() => brands.id),
        reskin_target_brand_custom: varchar("reskin_target_brand_custom", { length: 100 }),
        reskin_notes: text("reskin_notes"),

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
    reskin_target_brand: one(brands, {
        fields: [orderItems.reskin_target_brand_id],
        references: [brands.id],
    }),
    reskin_request: one(reskinRequests, {
        fields: [orderItems.id],
        references: [reskinRequests.order_item_id],
    }),
}));

// ---------------------------------- RESKIN REQUESTS (NEW) ------------------------------------
export const reskinRequests = pgTable(
    "reskin_requests",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        order_id: uuid("order")
            .notNull()
            .references(() => orders.id, { onDelete: "cascade" }),
        order_item_id: uuid("order_item")
            .notNull()
            .references(() => orderItems.id, { onDelete: "cascade" }),

        // Original asset (snapshot at request time)
        original_asset_id: uuid("original_asset")
            .notNull()
            .references(() => assets.id),
        original_asset_name: varchar("original_asset_name", { length: 200 }).notNull(),

        // Target brand (one required)
        target_brand_id: uuid("target_brand").references(() => brands.id),
        target_brand_custom: varchar("target_brand_custom", { length: 100 }),

        // Client's request (from order creation)
        client_notes: text("client_notes").notNull(),

        // Admin additions (during pricing review)
        admin_notes: text("admin_notes"),

        // Completion (when fabrication done)
        new_asset_id: uuid("new_asset").references(() => assets.id),
        new_asset_name: varchar("new_asset_name", { length: 200 }),
        completed_at: timestamp("completed_at"),
        completed_by: uuid("completed_by").references(() => users.id),
        completion_notes: text("completion_notes"),
        completion_photos: text("completion_photos")
            .array()
            .default(sql`ARRAY[]::text[]`),

        // Cancellation
        cancelled_at: timestamp("cancelled_at"),
        cancelled_by: uuid("cancelled_by").references(() => users.id),
        cancellation_reason: text("cancellation_reason"),

        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("reskin_requests_order_idx").on(table.order_id),
        index("reskin_requests_order_item_idx").on(table.order_item_id),
        index("reskin_requests_pending_idx")
            .on(table.order_id)
            .where(sql`${table.completed_at} IS NULL AND ${table.cancelled_at} IS NULL`),
    ]
);

export const reskinRequestsRelations = relations(reskinRequests, ({ one, many }) => ({
    platform: one(platforms, { fields: [reskinRequests.platform_id], references: [platforms.id] }),
    order: one(orders, { fields: [reskinRequests.order_id], references: [orders.id] }),
    order_item: one(orderItems, {
        fields: [reskinRequests.order_item_id],
        references: [orderItems.id],
    }),
    original_asset: one(assets, {
        fields: [reskinRequests.original_asset_id],
        references: [assets.id],
        relationName: "original_asset",
    }),
    new_asset: one(assets, {
        fields: [reskinRequests.new_asset_id],
        references: [assets.id],
        relationName: "new_asset",
    }),
    target_brand: one(brands, {
        fields: [reskinRequests.target_brand_id],
        references: [brands.id],
    }),
    completed_by_user: one(users, {
        fields: [reskinRequests.completed_by],
        references: [users.id],
        relationName: "reskin_completed_by",
    }),
    cancelled_by_user: one(users, {
        fields: [reskinRequests.cancelled_by],
        references: [users.id],
        relationName: "reskin_cancelled_by",
    }),
    line_items: many(lineItems),
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
        order_id: uuid("order_id")
            .references(() => orders.id, { onDelete: "cascade" }),
        inbound_request_id: uuid("inbound_request_id")
            .references(() => inboundRequests.id, { onDelete: "cascade" }),
        purpose_type: invoiceTypeEnum("purpose_type").notNull(),
        // Type linkage (one or neither, not both)
        service_type_id: uuid("service_type_id").references(() => serviceTypes.id), // NULL for custom items
        reskin_request_id: uuid("reskin_request_id").references(() => reskinRequests.id), // Links custom item to reskin

        // Item details
        line_item_type: lineItemTypeEnum("line_item_type").notNull(),
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
        index("order_line_items_order_idx").on(table.order_id),
        index("order_line_items_reskin_idx").on(table.reskin_request_id),
        index("order_line_items_active_idx").on(table.order_id, table.is_voided),
    ]
);

export const lineItemsRelations = relations(lineItems, ({ one }) => ({
    platform: one(platforms, { fields: [lineItems.platform_id], references: [platforms.id] }),
    order: one(orders, { fields: [lineItems.order_id], references: [orders.id] }),
    service_type: one(serviceTypes, {
        fields: [lineItems.service_type_id],
        references: [serviceTypes.id],
    }),
    reskin_request: one(reskinRequests, {
        fields: [lineItems.reskin_request_id],
        references: [reskinRequests.id],
    }),
    added_by_user: one(users, { fields: [lineItems.added_by], references: [users.id] }),
    voided_by_user: one(users, { fields: [lineItems.voided_by], references: [users.id] }),
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
        order_id: uuid("order_id")
            .references(() => orders.id, { onDelete: "cascade" }),
        inbound_request_id: uuid("inbound_request_id")
            .references(() => inboundRequests.id, { onDelete: "cascade" }),
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
        unique("platform_invoice_id_unique").on(table.platform_id, table.invoice_id),
    ]
);

export const invoicesRelations = relations(invoices, ({ one }) => ({
    order: one(orders, { fields: [invoices.order_id], references: [orders.id] }),
    platform: one(platforms, { fields: [invoices.platform_id], references: [platforms.id] }),
    generated_by_user: one(users, { fields: [invoices.generated_by], references: [users.id] }),
    updated_by_user: one(users, { fields: [invoices.updated_by], references: [users.id] }),
}));

// ---------------------------------- ASSET BOOKINGS ---------------------------------------
export const assetBookings = pgTable(
    "asset_bookings",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        asset_id: uuid("asset_id")
            .notNull()
            .references(() => assets.id, { onDelete: "cascade" }),
        order_id: uuid("order_id")
            .notNull()
            .references(() => orders.id, { onDelete: "cascade" }),
        quantity: integer("quantity").notNull(),
        blocked_from: timestamp("blocked_from", { mode: "date" }).notNull(),
        blocked_until: timestamp("blocked_until", { mode: "date" }).notNull(),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [index("asset_bookings_dates_idx").on(table.blocked_from, table.blocked_until)]
);

export const assetBookingsRelations = relations(assetBookings, ({ one }) => ({
    asset: one(assets, { fields: [assetBookings.asset_id], references: [assets.id] }),
    order: one(orders, { fields: [assetBookings.order_id], references: [orders.id] }),
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
export const scanEvents = pgTable("scan_events", {
    id: uuid("id").primaryKey().defaultRandom(),
    order_id: uuid("order")
        .notNull()
        .references(() => orders.id, { onDelete: "cascade" }),
    asset_id: uuid("asset")
        .notNull()
        .references(() => assets.id),
    scan_type: scanTypeEnum("scan_type").notNull(),
    quantity: integer("quantity").notNull(),
    condition: assetConditionEnum("condition").notNull(),
    notes: text("notes"),
    photos: text("photos")
        .array()
        .default(sql`ARRAY[]::text[]`),
    discrepancy_reason: discrepancyReasonEnum("discrepancy_reason"),
    scanned_by: uuid("scanned_by")
        .notNull()
        .references(() => users.id),
    scanned_at: timestamp("scanned_at").notNull().defaultNow(),
});

export const scanEventsRelations = relations(scanEvents, ({ one }) => ({
    order: one(orders, { fields: [scanEvents.order_id], references: [orders.id] }),
    asset: one(assets, { fields: [scanEvents.asset_id], references: [assets.id] }),
    scanned_by_user: one(users, { fields: [scanEvents.scanned_by], references: [users.id] }),
}));

// ---------------------------------- NOTIFICATION LOGS ------------------------------------
// Purpose: Track all system emails (Quotes, Invoices, Status Updates)
export const notificationLogs = pgTable(
    "notification_logs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        order_id: uuid("order")
            .notNull()
            .references(() => orders.id, { onDelete: "cascade" }),

        notification_type: varchar("notification_type", { length: 100 }).notNull(),
        recipients: text("recipients").notNull(), // JSON string of recipients

        status: notificationStatusEnum("status").notNull().default("QUEUED"),
        attempts: integer("attempts").notNull().default(1),

        last_attempt_at: timestamp("last_attempt_at").notNull().defaultNow(),
        sent_at: timestamp("sent_at"),
        message_id: varchar("message_id", { length: 255 }), // ID from Email Provider (Resend)
        error_message: text("error_message"),

        created_at: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => [
        index("notification_logs_order_idx").on(table.order_id),
        index("notification_logs_status_idx").on(table.status),
    ]
);

export const notificationLogsRelations = relations(notificationLogs, ({ one }) => ({
    order: one(orders, { fields: [notificationLogs.order_id], references: [orders.id] }),
    platform: one(platforms, {
        fields: [notificationLogs.platform_id],
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
        created_at: timestamp("created_at").notNull().defaultNow()
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
        unique("cities_platform_country_name_unique").on(table.platform_id, table.country_id, table.name) // City name must be unique within a platform and country
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
        warehouse_ops_rate: decimal("warehouse_ops_rate", { precision: 10, scale: 2 }).notNull(),
        base_ops_total: decimal("base_ops_total", { precision: 10, scale: 2 }).notNull(),
        logistics_sub_total: decimal("logistics_sub_total", { precision: 10, scale: 2 }),
        transport: jsonb("transport").notNull(), // { "system_rate": 10, "final_rate": 20 }
        line_items: jsonb("line_items").notNull(), // { "catalog_total": 10, "custom_total": 20 }
        margin: jsonb("margin").notNull(), // { "percent": 10, "amount": 20, is_override: false, override_reason: "" }
        final_total: decimal("final_total", { precision: 10, scale: 2 }),
        calculated_at: timestamp("calculated_at").notNull().defaultNow(),
        calculated_by: uuid("calculated_by").notNull().references(() => users.id),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    },
    (table) => [
        index("order_prices_platform_idx").on(table.platform_id),
    ]
);

export const orderPricesRelations = relations(prices, ({ one }) => ({
    platform: one(platforms, {
        fields: [prices.platform_id],
        references: [platforms.id],
    })
}));


// ---------------------------------- INBOUND REQUEST --------------------------------------
export const inboundRequests = pgTable(
    "inbound_requests",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        platform_id: uuid("platform_id")
            .notNull()
            .references(() => platforms.id, { onDelete: "cascade" }),
        company_id: uuid("company_id")
            .notNull()
            .references(() => companies.id, { onDelete: "cascade" }),
        requester_id: uuid("requester_id")
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
    requester: one(users, {
        fields: [inboundRequests.requester_id],
        references: [users.id],
    }),
    request_pricing: one(prices, {
        fields: [inboundRequests.request_pricing_id],
        references: [prices.id],
    }),
    items: many(inboundRequestItems),
}));

// ---------------------------------- INBOUND REQUEST ITEM ---------------------------------
export const inboundRequestItems = pgTable(
    "inbound_request_items",
    {
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
        created_asset_id: uuid("created_asset_id").references(() => assets.id),
        created_at: timestamp("created_at").notNull().defaultNow(),
        updated_at: timestamp("updated_at")
            .$onUpdate(() => new Date())
            .notNull(),
    });

// ---------------------------------- VEHICLE TYPES ---------------------------------
export const vehicleTypes = pgTable("vehicle_types", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    vehicle_size: varchar("vehicle_size", { length: 100 }).notNull(),
    platform_id: uuid("platform_id").references(() => platforms.id),
    is_default: boolean("is_default").notNull().default(false),
    is_active: boolean("is_active").notNull().default(true),
    display_order: integer("display_order").notNull().default(1),
    description: text("description"),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at")
        .$onUpdate(() => new Date())
        .notNull(),
});

export const vehicleTypesRelations = relations(vehicleTypes, ({ one }) => ({
    platform: one(platforms, {
        fields: [vehicleTypes.platform_id],
        references: [platforms.id],
    }),
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
        fields: [inboundRequestItems.created_asset_id],
        references: [assets.id],
    }),
}));
