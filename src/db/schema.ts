import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  decimal,
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
} from 'drizzle-orm/pg-core'

// ============================================================
// Enums
// ============================================================
export const userRoleEnum = pgEnum('user_role', [
  'ADMIN', // Platform Admin (Agency/Operator)
  'LOGISTICS', // Logistics Staff (Fulfillment Partner)
  'CLIENT', // Client User (Company User)
])

export const assetCategoryEnum = pgEnum('asset_category', [
  'FURNITURE',
  'GLASSWARE',
  'INSTALLATION',
  'DECOR',
  'OTHER',
])

export const trackingMethodEnum = pgEnum('tracking_method', [
  'INDIVIDUAL',
  'BATCH',
])
export const assetConditionEnum = pgEnum('asset_condition', ['GREEN', 'ORANGE', 'RED'])
export const assetStatusEnum = pgEnum('asset_status', [
  'AVAILABLE',
  'BOOKED',
  'OUT',
  'MAINTENANCE',
])
export const orderStatusEnum = pgEnum('order_status', [
  'DRAFT',
  'SUBMITTED',
  'PRICING_REVIEW',
  'PENDING_APPROVAL',
  'QUOTED',
  'DECLINED',
  'CONFIRMED',
  'IN_PREPARATION',
  'READY_FOR_DELIVERY',
  'IN_TRANSIT',
  'DELIVERED',
  'IN_USE',
  'AWAITING_RETURN',
  'CLOSED',
])
export const financialStatusEnum = pgEnum('financial_status', [
  'PENDING_QUOTE',
  'QUOTE_SENT',
  'QUOTE_ACCEPTED',
  'PENDING_INVOICE',
  'INVOICED',
  'PAID',
])
export const notificationStatusEnum = pgEnum('notification_status', [
  'QUEUED',
  'SENT',
  'FAILED',
  'RETRYING',
])
export const scanTypeEnum = pgEnum('scan_type', ['OUTBOUND', 'INBOUND'])
export const discrepancyReasonEnum = pgEnum('discrepancy_reason', [
  'BROKEN',
  'LOST',
  'OTHER',
])


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
// }

export const platforms = pgTable(
  'platforms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull(),
    domain: varchar('domain', { length: 100 }).notNull().unique(),
    config: jsonb('config').default({}).notNull(),
    features: jsonb('features').default({}).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('platforms_domain_idx').on(table.domain)]
)

export const platformsRelations = relations(platforms, ({ many }) => ({
  companies: many(companies),
  users: many(users),
  warehouses: many(warehouses),
  pricingTiers: many(pricingTiers),
}))

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
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    domain: varchar('domain', { length: 50 }).notNull(), // Subdomain
    settings: jsonb('settings').default({}).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    deleted_at: timestamp('deleted_at'),
  },
  (table) => [
    index('companies_platform_idx').on(table.platform),
    unique('companies_platform_domain_unique').on(table.platform, table.domain), // Domain must be unique within a platform
  ]
)

export const companyDomains = pgTable(
  'company_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    company: uuid('company')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    hostname: text('hostname').notNull().unique(), // e.g., 'client.diageo.com' or 'diageo.pmg-platform.com'
    type: varchar('type', { length: 30 }).notNull(), // 'vanity_subdomain' | 'custom_domain'
    isVerified: boolean('is_verified').default(false),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index('company_domains_hostname_idx').on(table.hostname)]
)

export const companiesRelations = relations(companies, ({ one, many }) => ({
  platform: one(platforms, {
    fields: [companies.platform],
    references: [platforms.id],
  }),
  domains: many(companyDomains),
  brands: many(brands),
  zones: many(zones),
  assets: many(assets),
  collections: many(collections),
  orders: many(orders),
  users: many(users),
}))

export const companyDomainsRelations = relations(companyDomains, ({ one }) => ({
  company: one(companies, {
    fields: [companyDomains.company],
    references: [companies.id],
  }),
  platform: one(platforms, {
    fields: [companyDomains.platform],
    references: [platforms.id],
  }),
}))

// ---------------------------------- USER ------------------------------------------------
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    company: uuid('company').references(() => companies.id), // Multi-tenancy: Client users belong to a company, Admin/Logistics are null
    name: varchar('name', { length: 100 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    password: varchar('password', { length: 255 }).notNull(), // hashed password
    role: userRoleEnum('role').notNull().default('CLIENT'),
    permissions: text('permissions')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    permission_template: varchar('permission_template', { length: 50 }), // PLATFORM_ADMIN, LOGISTICS_STAFF, CLIENT_USER
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('user_platform_idx').on(table.platform),
    index('user_company_idx').on(table.company),
    // IMPORTANT: Email is unique PER PLATFORM, not globally
    uniqueIndex('user_platform_email_unique').on(table.platform, table.email),
  ]
)

export const userRelations = relations(users, ({ one, many }) => ({
  platform: one(platforms, {
    fields: [users.platform],
    references: [platforms.id],
  }),
  company: one(companies, {
    fields: [users.company],
    references: [companies.id],
  }),
  sessions: many(session),
  accounts: many(account),
  orders: many(orders),
  scannedAssets: many(assets), // For lastScannedBy
}))

// ---------------------------------- BRAND -----------------------------------------------
export const brands = pgTable(
  'brands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
        .notNull()
        .references(() => platforms.id, { onDelete: 'cascade' }),
    company: uuid('company')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    logoUrl: text('logo_url'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique('brands_company_name_unique').on(table.company, table.name),
  ]
)

export const brandsRelations = relations(brands, ({ one, many }) => ({
  platform: one(platforms, {
    fields: [brands.platform],
    references: [platforms.id],
  }),
  company: one(companies, {
    fields: [brands.company],
    references: [companies.id],
  }),
  assets: many(assets),
  collections: many(collections),
}))

// ---------------------------------- WAREHOUSE -------------------------------------------
export const warehouses = pgTable(
  'warehouses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    country: varchar('country', { length: 50 }).notNull(),
    city: varchar('city', { length: 50 }).notNull(),
    address: text('address').notNull(),
    coordinates: jsonb('coordinates'), // GPS coordinates {lat, lng}
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique('warehouses_platform_name_unique').on(table.platform, table.name),
  ]
)

export const warehousesRelations = relations(warehouses, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [warehouses.platform],
        references: [platforms.id],
    }),
    zones: many(zones),
    assets: many(assets),
}))

// ---------------------------------- ZONES -----------------------------------------------
export const zones = pgTable(
  'zones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
        .notNull()
        .references(() => platforms.id, { onDelete: 'cascade' }),
    warehouse: uuid('warehouse')
      .notNull()
      .references(() => warehouses.id),
    company: uuid('company')
      .notNull()
      .references(() => companies.id),
    name: varchar('name', { length: 50 }).notNull(),
    description: text('description'),
    capacity: integer('capacity'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    unique('zones_warehouse_company_name_unique').on(
      table.warehouse,
      table.company,
      table.name
    ),
  ]
)

export const zonesRelations = relations(zones, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [zones.platform],
        references: [platforms.id],
    }),
    warehouse: one(warehouses, {
        fields: [zones.warehouse],
        references: [warehouses.id],
    }),
    company: one(companies, {
        fields: [zones.company],
        references: [companies.id],
    }),
    assets: many(assets),
}))

// ---------------------------------- ASSET -----------------------------------------------
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    company: uuid('company')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    warehouse: uuid('warehouse')
      .notNull()
      .references(() => warehouses.id),
    zone: uuid('zone')
      .notNull()
      .references(() => zones.id),
    brand: uuid('brand').references(() => brands.id),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    category: assetCategoryEnum('category').notNull(),
    images: text('images')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    trackingMethod: trackingMethodEnum('tracking_method').notNull(),
    totalQuantity: integer('total_quantity').notNull().default(1),
    availableQuantity: integer('available_quantity').notNull().default(1),
    qrCode: varchar('qr_code', { length: 100 }).notNull().unique(),
    packaging: varchar('packaging', { length: 100 }),
    weightPerUnit: decimal('weight_per_unit', { precision: 8, scale: 2 }).notNull(), // in kilograms
    dimensions: jsonb('dimensions').default({}).notNull(), // {length, width, height} in cm
    volumePerUnit: decimal('volume_per_unit', { precision: 8, scale: 3 }).notNull(), // in cubic meters
    condition: assetConditionEnum('condition').notNull().default('GREEN'),
    conditionNotes: text('condition_notes'),
    refurbDaysEstimate: integer('refurb_days_estimate'), // Estimated days until available (for Red condition)
    conditionHistory: jsonb('condition_history').default([]),
    handlingTags: text('handling_tags')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    status: assetStatusEnum('status').notNull().default('AVAILABLE'),
    lastScannedAt: timestamp('last_scanned_at'),
    lastScannedBy: uuid('last_scanned_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('assets_platform_idx').on(table.platform),
    index('assets_company_idx').on(table.company),
    index('assets_qr_code_idx').on(table.qrCode),
  ]
)

export const assetsRelations = relations(assets, ({ one, many }) => ({
    company: one(companies, { fields: [assets.company], references: [companies.id] }),
    platform: one(platforms, { fields: [assets.platform], references: [platforms.id] }),
    brand: one(brands, { fields: [assets.brand], references: [brands.id] }),
    warehouse: one(warehouses, { fields: [assets.warehouse], references: [warehouses.id] }),
    zone: one(zones, { fields: [assets.zone], references: [zones.id] }),
    lastScannedByUser: one(users, { fields: [assets.lastScannedBy], references: [users.id] }),
    collectionItems: many(collectionItems),
    orderItems: many(orderItems),
    scanEvents: many(scanEvents),
    bookings: many(assetBookings),
}))

// ---------------------------------- COLLECTION ------------------------------------------
export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    company: uuid('company')
      .notNull()
      .references(() => companies.id),
    brand: uuid('brand').references(() => brands.id),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    images: text('images')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    category: varchar('category', { length: 50 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('collections_company_idx').on(table.company),
  ]
)

export const collectionRelations = relations(collections, ({ one, many }) => ({
    platform: one(platforms, {
        fields: [collections.platform],
        references: [platforms.id],
    }),
    company: one(companies, {
        fields: [collections.company],
        references: [companies.id],
    }),
    brand: one(brands, {
        fields: [collections.brand],
        references: [brands.id],
    }),
  assets: many(collectionItems),
    orders: many(orders),
}))

// ---------------------------------- COLLECTION ITEM --------------------------------------
export const collectionItems = pgTable(
  'collection_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    collection: uuid('collection')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    asset: uuid('asset')
      .notNull()
      .references(() => assets.id),
    defaultQuantity: integer('default_quantity').notNull().default(1),
    notes: text('notes'),
    displayOrder: integer('display_order'), // Sort order in collection
    createdAt: timestamp('created_at').notNull().defaultNow(), 
  },
  (table) => [
    unique('collection_items_unique').on(table.collection, table.asset),
  ]
)

export const collectionItemsRelations = relations(collectionItems, ({ one }) => ({
    collection: one(collections, { fields: [collectionItems.collection], references: [collections.id] }),
    asset: one(assets, { fields: [collectionItems.asset], references: [assets.id] }),
}))

// ---------------------------------- PRICING TIER -----------------------------------------
export const pricingTiers = pgTable(
  'pricing_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    country: varchar('country', { length: 50 }).notNull(),
    city: varchar('city', { length: 50 }).notNull(),
    volumeMin: decimal('volume_min', { precision: 8, scale: 3 }).notNull(),
    volumeMax: decimal('volume_max', { precision: 8, scale: 3 }),
    basePrice: decimal('base_price', { precision: 10, scale: 2 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('pricing_tiers_platform_location_idx').on(
      table.platform,
      table.country,
      table.city
    ),
    unique('pricing_tiers_unique').on(table.platform, table.country, table.city, table.volumeMin, table.volumeMax),
  ]
)

// ---------------------------------- ORDER ------------------------------------------------
export const orders = pgTable(
  'orders',
  {
    // Core identifiers
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    orderId: varchar('order_id', { length: 20 }).notNull(), // Human-readable ID (ORD-YYYYMMDD-XXX)
    company: uuid('company')
      .notNull()
      .references(() => companies.id),
    brand: uuid('brand').references(() => brands.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    jobNumber: varchar('job_number', { length: 50 }),
    
    // Contact information
    contactName: varchar('contact_name', { length: 100 }).notNull(),
    contactEmail: varchar('contact_email', { length: 255 }).notNull(),
    contactPhone: varchar('contact_phone', { length: 50 }).notNull(),
    
    // Event details
    eventStartDate: timestamp('event_start_date', { mode: 'date' }).notNull(),
    eventEndDate: timestamp('event_end_date', { mode: 'date' }).notNull(),
    venueName: varchar('venue_name', { length: 200 }).notNull(),
    venueLocation: jsonb('venue_location').notNull(), // {country, city, address, access_notes}
    specialInstructions: text('special_instructions'),
    
    // Logistics windows
    deliveryWindow: jsonb('delivery_window'), // {start, end} datetime
    pickupWindow: jsonb('pickup_window'), // {start, end} datetime
    
    // Calculations
    calculatedTotals: jsonb('calculated_totals').notNull(), // {volume, weight} totals
    
    // Pricing
    tier_id: uuid('tier').references(() => pricingTiers.id),
    logisticsPricing: jsonb('logistics_pricing'), // {base_price, adjusted_price, adjustment_reason, adjusted_at, adjusted_by}
    platformPricing: jsonb('platform_pricing'), // {margin_percent, margin_amount, reviewed_at, reviewed_by, notes}
    finalPricing: jsonb('final_pricing'), // {total_price, quote_sent_at}
    
    // Invoicing
    invoiceId: varchar('invoice_id', { length: 30 }), // TODO: reference
    invoiceGeneratedAt: timestamp('invoice_generated_at'),
    invoicePaidAt: timestamp('invoice_paid_at'),
    paymentMethod: varchar('payment_method', { length: 50 }),
    paymentReference: varchar('payment_reference', { length: 100 }),
    
    // Status tracking
    orderStatus: orderStatusEnum('order_status').notNull().default('DRAFT'),
    financialStatus: financialStatusEnum('financial_status').notNull().default('PENDING_QUOTE'),
    orderStatusHistory: jsonb('order_status_history').default('[]'),
    financialStatusHistory: jsonb('financial_status_history').default('[]'),
    
    // Scanning & photos
    scanningData: jsonb('scanning_data').default('{}'), // {scanned_out: [], scanned_in: []}
    deliveryPhotos: text('delivery_photos').array().default(sql`ARRAY[]::text[]`),
    
    // Timestamps
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()).notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    // Order ID unique per platform
    unique('orders_platform_order_id_unique').on(table.platform, table.orderId),
    // Invoice ID unique per platform when not null
    unique('orders_platform_invoice_id_unique').on(table.platform, table.invoiceId),
    
    // Indexes for performance
    index('orders_platform_company_idx').on(table.platform, table.company),
    index('orders_status_idx').on(table.orderStatus),
    index('orders_financial_status_idx').on(table.financialStatus),
    index('orders_event_date_idx').on(table.eventStartDate),
    index('orders_created_at_idx').on(table.createdAt),
  ]
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
    platform: one(platforms, { fields: [orders.platform], references: [platforms.id] }),
  company: one(companies, { fields: [orders.company], references: [companies.id] }),
    brand: one(brands, { fields: [orders.brand], references: [brands.id] }),
    user: one(users, { fields: [orders.userId], references: [users.id] }),
    pricingTier: one(pricingTiers, { fields: [orders.tier_id], references: [pricingTiers.id] }),
    items: many(orderItems),
    scanEvents: many(scanEvents),
    assetBookings: many(assetBookings),
}))

// ---------------------------------- ORDER ITEM -------------------------------------------
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    order: uuid('order')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    asset: uuid('asset')
      .notNull()
      .references(() => assets.id),
    
    // Snapshot data
    assetName: varchar('asset_name', { length: 200 }).notNull(),
    quantity: integer('quantity').notNull(),
    volumePerUnit: decimal('volume_per_unit', { precision: 8, scale: 3 }).notNull(),
    weightPerUnit: decimal('weight_per_unit', { precision: 8, scale: 2 }).notNull(),
    totalVolume: decimal('total_volume', { precision: 8, scale: 3 }).notNull(),
    totalWeight: decimal('total_weight', { precision: 8, scale: 2 }).notNull(),
    conditionNotes: text('condition_notes'),
    handlingTags: text('handling_tags').array().default(sql`ARRAY[]::text[]`),
    
    fromCollection: uuid('from_collection').references(() => collections.id),
    fromCollectionName: varchar('from_collection_name', { length: 200 }),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    // Indexes for performance
    index('order_items_order_idx').on(table.order),
    index('order_items_asset_idx').on(table.asset),
    index('order_items_platform_idx').on(table.platform),
    index('order_items_from_collection_idx').on(table.fromCollection),
  ]
);

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
    platform: one(platforms, { fields: [orderItems.platform], references: [platforms.id] }),
    order: one(orders, { fields: [orderItems.order], references: [orders.id] }),
    asset: one(assets, { fields: [orderItems.asset], references: [assets.id] }),
    from_collection: one(collections, { fields: [orderItems.fromCollection], references: [collections.id] }),
}))


// -----------------------------------------------------------------------------------------
// ---------------------------------- SESSION ----------------------------------------------
export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)]
)

// ---------------------------------- ACCOUNT ----------------------------------------------
export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)]
)

// ---------------------------------- VERIFICATION -----------------------------------------
export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()).notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)]
)

// ---------------------------------- ASSET BOOKINGS ---------------------------------------
export const assetBookings = pgTable(
  'asset_bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    asset: uuid('asset')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    order: uuid('order')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull(),
    blockedFrom: timestamp('blocked_from', { mode: 'date' }).notNull(),
    blockedUntil: timestamp('blocked_until', { mode: 'date' }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').$onUpdate(() => new Date()).notNull(),
  },
  (table) => [
    index('asset_bookings_dates_idx').on(table.blockedFrom, table.blockedUntil),
  ]
)

// ---------------------------------- ASSET CONDITION HISTORY ------------------------------
export const assetConditionHistory = pgTable(
  'asset_condition_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Multi-tenancy: Strictly scoped to platform
    platform: uuid('platform')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    asset: uuid('asset')
      .notNull()
      .references(() => assets.id, { onDelete: 'cascade' }),
    
    condition: assetConditionEnum('condition').notNull(),
    notes: text('notes'),
    photos: text('photos')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
  },
  (table) => [
    index('asset_condition_history_asset_idx').on(table.asset),
    index('asset_condition_history_platform_idx').on(table.platform),
  ]
)

export const assetConditionHistoryRelations = relations(
  assetConditionHistory,
  ({ one }) => ({
    asset: one(assets, { fields: [assetConditionHistory.asset], references: [assets.id] }),
    platform: one(platforms, { fields: [assetConditionHistory.platform], references: [platforms.id] }),
    updatedByUser: one(users, { fields: [assetConditionHistory.updatedBy], references: [users.id] }),
  })
)

// ---------------------------------- SCAN EVENTS ------------------------------------------
export const scanEvents = pgTable(
  'scan_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    order: uuid('order')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    asset: uuid('asset')
      .notNull()
      .references(() => assets.id),
    scanType: scanTypeEnum('scan_type').notNull(),
    quantity: integer('quantity').notNull(),
    condition: assetConditionEnum('condition').notNull(),
    notes: text('notes'),
    photos: text('photos').array().default(sql`ARRAY[]::text[]`),
    discrepancyReason: discrepancyReasonEnum('discrepancy_reason'),
    scannedBy: uuid('scanned_by')
      .notNull()
      .references(() => users.id),
    scannedAt: timestamp('scanned_at').notNull().defaultNow(),
  }
)

export const scanEventsRelations = relations(scanEvents, ({ one }) => ({
    order: one(orders, { fields: [scanEvents.order], references: [orders.id] }),
    asset: one(assets, { fields: [scanEvents.asset], references: [assets.id] }),
    scannedByUser: one(users, { fields: [scanEvents.scannedBy], references: [users.id] }),
}))

// ---------------------------------- ORDER STATUS HISTORY ---------------------------------
// Purpose: Timeline of order lifecycle changes (Submitted -> Quoted -> Delivered)
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    order: uuid('order')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    
    status: orderStatusEnum('status').notNull(),
    notes: text('notes'),
    
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id),
    timestamp: timestamp('timestamp').notNull().defaultNow(),
  },
  (table) => [
    index('order_status_history_order_idx').on(table.order),
  ]
)

export const orderStatusHistoryRelations = relations(
  orderStatusHistory,
  ({ one }) => ({
    order: one(orders, { fields: [orderStatusHistory.order], references: [orders.id] }),
    platform: one(platforms, { fields: [orderStatusHistory.platform], references: [platforms.id] }),
    updatedByUser: one(users, { fields: [orderStatusHistory.updatedBy], references: [users.id] }),
  })
)

// ---------------------------------- NOTIFICATION LOGS ------------------------------------
// Purpose: Track all system emails (Quotes, Invoices, Status Updates)
export const notificationLogs = pgTable(
  'notification_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: uuid('platform')
      .notNull()
      .references(() => platforms.id, { onDelete: 'cascade' }),
    order: uuid('order')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    
    notificationType: varchar('notification_type', { length: 100 }).notNull(),
    recipients: text('recipients').notNull(), // JSON string of recipients
    
    status: notificationStatusEnum('status').notNull().default('QUEUED'),
    attempts: integer('attempts').notNull().default(1),
    
    lastAttemptAt: timestamp('last_attempt_at').notNull().defaultNow(),
    sentAt: timestamp('sent_at'),
    messageId: varchar('message_id', { length: 255 }), // ID from Email Provider (Resend)
    errorMessage: text('error_message'),
    
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('notification_logs_order_idx').on(table.order),
    index('notification_logs_status_idx').on(table.status),
  ]
)

export const notificationLogsRelations = relations(
  notificationLogs,
  ({ one }) => ({
    order: one(orders, { fields: [notificationLogs.order], references: [orders.id] }),
    platform: one(platforms, { fields: [notificationLogs.platform], references: [platforms.id] }),
  })
)
