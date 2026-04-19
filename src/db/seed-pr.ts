/**
 * PERNOD RICARD — PRODUCTION SETUP SEED
 *
 * Standalone seed for the Pernod Ricard environment.
 * Contains only operational essentials — no demo orders, fake scans, or test data.
 *
 * What's seeded:
 *   - Platform
 *   - Pernod Ricard company (only)
 *   - Countries & cities
 *   - Company domains
 *   - Warehouse + PR zones
 *   - Users (admin, logistics, PR client)
 *   - All PR brands (29)
 *   - Service types
 *   - Notification rules
 *   - Assets (from preview-latest import bundle via seedPrAssets)
 *
 * Run: bun run db:seed:pr
 */

import { assertAppEnv } from "./safety/guards";
import { companyFeatures } from "../app/constants/common";
import { PlatformBootstrapService } from "../app/services/platform-bootstrap.service";
import { DEFAULT_ACCESS_POLICY_CODES } from "../app/utils/access-policy";
import { db } from "./index";
import * as schema from "./schema";
import bcrypt from "bcrypt";
import { seedPrAssets } from "./scripts/seed-pr-assets";

assertAppEnv(["staging"]);

// ============================================================
// STATE STORE
// ============================================================

const S = {
    platform: null as any,
    accessPolicies: [] as any[],
    company: null as any, // Pernod Ricard only
    country: null as any,
    cities: [] as any[],
    users: [] as any[],
    warehouse: null as any,
    brands: [] as any[],
    zones: [] as any[],
    serviceTypes: [] as any[],
    teams: [] as any[],
    attachmentTypes: [] as any[],
    workflowDefinitions: [] as any[],
};

const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
const accessPolicyByCode = (code: string) =>
    S.accessPolicies.find((policy) => policy.code === code)!;
const brandLogo = (name: string) =>
    `https://placehold.co/400x200/2563eb/FFFFFF?text=${encodeURIComponent(name + "\\nLogo")}`;

// ============================================================
// CLEANUP
// ============================================================

async function cleanup() {
    console.log("🧹 Cleaning up existing data...");
    const safeDelete = async (label: string, fn: () => Promise<unknown>) => {
        try {
            await fn();
        } catch (error) {
            console.log(`  ↳ Skipping ${label}: ${(error as Error).message}`);
        }
    };

    await safeDelete("notification_logs", () => db.delete(schema.notificationLogs));
    await safeDelete("system_events", () => db.delete(schema.systemEvents));
    await safeDelete("notification_rules", () => db.delete(schema.notificationRules));
    await safeDelete("entity_attachments", () => db.delete(schema.entityAttachments));
    await safeDelete("workflow_requests", () => db.delete(schema.workflowRequests));
    await safeDelete("workflow_definition_company_overrides", () =>
        db.delete(schema.workflowDefinitionCompanyOverrides)
    );
    await safeDelete("workflow_definitions", () => db.delete(schema.workflowDefinitions));
    await safeDelete("attachment_types", () => db.delete(schema.attachmentTypes));
    await safeDelete("asset_versions", () => db.delete(schema.assetVersions));
    await safeDelete("asset_condition_history", () => db.delete(schema.assetConditionHistory));
    await safeDelete("scan_events", () => db.delete(schema.scanEvents));
    await safeDelete("financial_status_history", () => db.delete(schema.financialStatusHistory));
    await safeDelete("order_status_history", () => db.delete(schema.orderStatusHistory));
    await safeDelete("invoices", () => db.delete(schema.invoices));
    await safeDelete("asset_bookings", () => db.delete(schema.assetBookings));
    await safeDelete("line_items", () => db.delete(schema.lineItems));
    await safeDelete("service_request_status_history", () =>
        db.delete(schema.serviceRequestStatusHistory)
    );
    await safeDelete("service_request_items", () => db.delete(schema.serviceRequestItems));
    await safeDelete("service_requests", () => db.delete(schema.serviceRequests));
    await safeDelete("order_items", () => db.delete(schema.orderItems));
    await safeDelete("orders", () => db.delete(schema.orders));
    await safeDelete("inbound_request_items", () => db.delete(schema.inboundRequestItems));
    await safeDelete("inbound_requests", () => db.delete(schema.inboundRequests));
    await safeDelete("prices", () => db.delete(schema.prices));
    await safeDelete("collection_items", () => db.delete(schema.collectionItems));
    await safeDelete("collections", () => db.delete(schema.collections));
    await safeDelete("assets", () => db.delete(schema.assets));
    await safeDelete("service_types", () => db.delete(schema.serviceTypes));
    await safeDelete("self_booking_items", () => db.delete(schema.selfBookingItems));
    await safeDelete("self_bookings", () => db.delete(schema.selfBookings));
    await safeDelete("cities", () => db.delete(schema.cities));
    await safeDelete("countries", () => db.delete(schema.countries));
    await safeDelete("zones", () => db.delete(schema.zones));
    await safeDelete("brands", () => db.delete(schema.brands));
    await safeDelete("company_domains", () => db.delete(schema.companyDomains));
    await safeDelete("users", () => db.delete(schema.users));
    await safeDelete("access_policies", () => db.delete(schema.accessPolicies));
    await safeDelete("companies", () => db.delete(schema.companies));
    await safeDelete("warehouses", () => db.delete(schema.warehouses));
    await safeDelete("platforms", () => db.delete(schema.platforms));
    console.log("✓ Cleanup complete\n");
}

// ============================================================
// INFRASTRUCTURE
// ============================================================

async function seedPlatform() {
    console.log("🌐 Seeding platform...");
    const [platform] = await db
        .insert(schema.platforms)
        .values({
            name: "Kadence",
            domain: "kadence.ae",
            config: {
                logo_url: "https://placehold.co/200x80/f97316/ffffff?text=Game+On",
                primary_color: "#f97316",
                secondary_color: "#0ea5e9",
                from_email: "no-reply@kadence.ae",
                currency: "AED",
                feasibility: {
                    minimum_lead_hours: 24,
                    exclude_weekends: true,
                    weekend_days: [0, 6],
                    timezone: "Asia/Dubai",
                },
            },
            features: {
                ...companyFeatures,
            },
            is_active: true,
        })
        .returning();
    S.platform = platform;
    console.log(`✓ Platform: ${platform.name}`);
}

async function seedAccessPolicies() {
    console.log("🔐 Seeding access policies...");
    const bootstrap = await PlatformBootstrapService.bootstrapPlatform({
        platformId: S.platform.id,
        createSystemUser: true,
    });
    S.accessPolicies = bootstrap.policies;
    console.log(`✓ ${bootstrap.policies.length} access policies`);
}

async function seedCompany() {
    console.log("🏢 Seeding company...");
    const [company] = await db
        .insert(schema.companies)
        .values({
            platform_id: S.platform.id,
            name: "Pernod Ricard",
            domain: "pernod-ricard",
            settings: {
                branding: {
                    title: "Pernod Ricard Events",
                    logo_url: brandLogo("Pernod Ricard"),
                    primary_color: "#1B1464",
                    secondary_color: "#FFD700",
                },
            },
            features: companyFeatures,
            platform_margin_percent: "25.00",
            warehouse_ops_rate: "10.00",
            contact_email: "events@pernod-ricard.com",
            contact_phone: "+971-50-111-1111",
            is_active: true,
        })
        .returning();
    S.company = company;
    console.log(`✓ Company: ${company.name}`);
}

async function seedCountriesAndCities() {
    console.log("🌍 Seeding countries & cities...");
    const [country] = await db
        .insert(schema.countries)
        .values({ platform_id: S.platform.id, name: "United Arab Emirates" })
        .returning();
    S.country = country;

    const cityNames = ["Dubai", "Abu Dhabi", "Sharjah", "Ajman", "Ras Al Khaimah"];
    const cities = await db
        .insert(schema.cities)
        .values(
            cityNames.map((name) => ({ platform_id: S.platform.id, country_id: country.id, name }))
        )
        .returning();
    S.cities = cities;
    console.log(`✓ 1 country, ${cities.length} cities`);
}

async function seedCompanyDomains() {
    console.log("🔗 Seeding company domains...");
    await db.insert(schema.companyDomains).values({
        platform_id: S.platform.id,
        company_id: S.company.id,
        hostname: "pernod-ricard.kadence.ae",
        type: "VANITY" as const,
        is_verified: true,
        is_active: true,
        is_primary: true,
    });
    console.log("✓ 1 company domain");
}

async function seedWarehouse() {
    console.log("🏭 Seeding warehouse...");
    const [wh] = await db
        .insert(schema.warehouses)
        .values({
            platform_id: S.platform.id,
            name: "DIC Warehouse",
            country: "UAE",
            city: "Dubai",
            address: "DIC Labour Village, Dubai, UAE",
            is_active: true,
        })
        .returning();
    S.warehouse = wh;
    console.log("✓ 1 warehouse");
}

async function seedUsers() {
    console.log("👥 Seeding users...");
    const pw = await hashPassword("password123");

    const adminPolicy = accessPolicyByCode(DEFAULT_ACCESS_POLICY_CODES.ADMIN);
    const logisticsPolicy = accessPolicyByCode(DEFAULT_ACCESS_POLICY_CODES.LOGISTICS);
    const clientPolicy = accessPolicyByCode(DEFAULT_ACCESS_POLICY_CODES.CLIENT);

    const users = await db
        .insert(schema.users)
        .values([
            {
                platform_id: S.platform.id,
                company_id: null,
                name: "Admin User",
                email: "admin@test.com",
                password: pw,
                role: "ADMIN" as const,
                permissions: [],
                access_policy_id: adminPolicy.id,
                is_super_admin: true,
                is_active: true,
            },
            {
                platform_id: S.platform.id,
                company_id: null,
                name: "Logistics User",
                email: "logistics@test.com",
                password: pw,
                role: "LOGISTICS" as const,
                permissions: [],
                access_policy_id: logisticsPolicy.id,
                is_active: true,
            },
            {
                platform_id: S.platform.id,
                company_id: null,
                name: "Andrew Crabtree",
                email: "ac@a2eventsco.com",
                password: pw,
                role: "LOGISTICS" as const,
                permissions: [],
                access_policy_id: logisticsPolicy.id,
                is_active: true,
            },
            {
                platform_id: S.platform.id,
                company_id: null,
                name: "Emlyn Culverwell",
                email: "ec@a2eventsco.com",
                password: pw,
                role: "LOGISTICS" as const,
                permissions: [],
                access_policy_id: logisticsPolicy.id,
                is_active: true,
            },
            {
                platform_id: S.platform.id,
                company_id: null,
                name: "Will Baxter",
                email: "wb@a2eventsco.com",
                password: pw,
                role: "LOGISTICS" as const,
                permissions: [],
                access_policy_id: logisticsPolicy.id,
                is_active: true,
            },
            {
                platform_id: S.platform.id,
                company_id: null,
                name: "Sarah Bannister",
                email: "sb@a2eventsco.com",
                password: pw,
                role: "LOGISTICS" as const,
                permissions: [],
                access_policy_id: logisticsPolicy.id,
                is_active: true,
            },
            {
                platform_id: S.platform.id,
                company_id: S.company.id,
                name: "Pernod Ricard Event Manager",
                email: "client@pernod-ricard.com",
                password: pw,
                role: "CLIENT" as const,
                permissions: [],
                access_policy_id: clientPolicy.id,
                is_active: true,
            },
        ])
        .returning();
    S.users = users;
    console.log(`✓ ${users.length} users`);
}

async function seedAttachmentTypes() {
    console.log("📎 Seeding attachment types...");
    const attachmentTypes = await db
        .insert(schema.attachmentTypes)
        .values([
            {
                platform_id: S.platform.id,
                code: "SUPPORTING_DOCUMENT",
                label: "Supporting Document",
                allowed_entity_types: ["ORDER", "INBOUND_REQUEST", "SERVICE_REQUEST"],
                upload_roles: ["ADMIN", "LOGISTICS", "CLIENT"],
                view_roles: ["ADMIN", "LOGISTICS", "CLIENT"],
                default_visible_to_client: true,
                sort_order: 0,
            },
            {
                platform_id: S.platform.id,
                code: "INTERNAL_REFERENCE",
                label: "Internal Reference",
                allowed_entity_types: ["ORDER", "INBOUND_REQUEST", "SERVICE_REQUEST"],
                upload_roles: ["ADMIN", "LOGISTICS"],
                view_roles: ["ADMIN", "LOGISTICS"],
                default_visible_to_client: false,
                sort_order: 1,
            },
            {
                platform_id: S.platform.id,
                code: "WORKFLOW_SUPPORTING_DOCUMENT",
                label: "Workflow Supporting Document",
                allowed_entity_types: ["WORKFLOW_REQUEST"],
                upload_roles: ["ADMIN", "LOGISTICS"],
                view_roles: ["ADMIN", "LOGISTICS"],
                default_visible_to_client: false,
                sort_order: 2,
            },
        ])
        .returning();
    S.attachmentTypes = attachmentTypes;
    console.log(`✓ ${attachmentTypes.length} attachment types`);
}

async function seedWorkflowDefinitions() {
    console.log("🔀 Seeding workflow definitions...");
    const definitions = await db
        .insert(schema.workflowDefinitions)
        .values([
            {
                platform_id: S.platform.id,
                code: "CREATIVE_SUPPORT",
                label: "Creative Support",
                description: "Request internal creative and design support for delivery prep.",
                workflow_family: "simple_request",
                status_model_key: "simple_request",
                allowed_entity_types: ["ORDER", "INBOUND_REQUEST", "SERVICE_REQUEST"],
                requester_roles: ["ADMIN", "LOGISTICS"],
                viewer_roles: ["ADMIN", "LOGISTICS"],
                actor_roles: ["ADMIN", "LOGISTICS"],
                priority_enabled: true,
                sla_hours: 48,
                blocks_fulfillment_default: false,
                intake_schema: {},
                is_active: true,
                sort_order: 0,
            },
        ])
        .returning();
    S.workflowDefinitions = definitions;
    console.log(`✓ ${definitions.length} workflow definitions`);
}

async function seedBrands() {
    console.log("🏷️  Seeding brands...");
    const prBrands = [
        { name: "Absolut", description: "Absolut Vodka activations" },
        { name: "Altos", description: "Altos Tequila brand activations" },
        { name: "Avion", description: "Avion Tequila brand activations" },
        { name: "Barracuda", description: "Barracuda venue brand assets" },
        { name: "Beefeater", description: "Beefeater Gin brand activations" },
        { name: "Blenders Pride", description: "Blenders Pride whisky activations" },
        { name: "Cedar's", description: "Cedar's non-alcoholic spirit activations" },
        { name: "Chivas Regal", description: "Chivas Regal whisky events" },
        { name: "General", description: "General / multi-use platform assets" },
        { name: "Havana Club", description: "Havana Club rum brand activations" },
        { name: "Jameson", description: "Jameson Irish Whiskey brand experiences" },
        { name: "Le Cercle", description: "Le Cercle brand assets" },
        { name: "Lillet", description: "Lillet aperitif brand activations" },
        { name: "Longitude 77", description: "Longitude 77 brand activations" },
        { name: "Longmorn", description: "Longmorn whisky brand activations" },
        { name: "Malfy", description: "Malfy Gin brand activations" },
        { name: "Martell", description: "Martell Cognac brand activations" },
        { name: "Moët", description: "Moët & Chandon champagne activations" },
        { name: "Monkey 47", description: "Monkey 47 Gin brand activations" },
        { name: "Multi-Brand", description: "Cross-brand and multi-brand activations" },
        { name: "Mumm", description: "Mumm champagne brand activations" },
        { name: "Perrier-Jouët", description: "Perrier-Jouët champagne brand activations" },
        { name: "Ricard", description: "Ricard pastis brand activations" },
        { name: "Royal Salute", description: "Royal Salute whisky brand activations" },
        { name: "Royal Stag", description: "Royal Stag whisky brand activations" },
        { name: "Sainte Marguerite", description: "Château Sainte Marguerite brand activations" },
        { name: "Sipsmith", description: "Sipsmith Gin brand activations" },
        { name: "The Glenlivet", description: "The Glenlivet whisky brand activations" },
        { name: "Unknown", description: "Unidentified / pending categorisation" },
    ].map((b) => ({
        platform_id: S.platform.id,
        company_id: S.company.id,
        logo_url: brandLogo(b.name),
        is_active: true,
        ...b,
    }));

    const brands = await db.insert(schema.brands).values(prBrands).returning();
    S.brands = brands;
    console.log(`✓ ${brands.length} brands`);
}

async function seedZones() {
    console.log("📦 Seeding zones...");
    const zones = await db
        .insert(schema.zones)
        .values([
            {
                platform_id: S.platform.id,
                warehouse_id: S.warehouse.id,
                company_id: S.company.id,
                name: "N/A",
                description: "N/A",
                capacity: 1000,
                is_active: true,
            },
        ])
        .returning();
    S.zones = zones;
    console.log(`✓ ${zones.length} zones`);
}

async function seedServiceTypes() {
    console.log("🛠️  Seeding service types...");
    const pid = S.platform.id;
    const baseServices = [
        {
            name: "Basic Assembly",
            category: "ASSEMBLY" as const,
            unit: "hour",
            default_rate: "75.00",
        },
        {
            name: "Complex Assembly",
            category: "ASSEMBLY" as const,
            unit: "hour",
            default_rate: "120.00",
        },
        {
            name: "Forklift Operation",
            category: "EQUIPMENT" as const,
            unit: "hour",
            default_rate: "200.00",
        },
        {
            name: "Loading / Unloading",
            category: "HANDLING" as const,
            unit: "hour",
            default_rate: "60.00",
        },
        {
            name: "Fragile Item Handling",
            category: "HANDLING" as const,
            unit: "unit",
            default_rate: "25.00",
        },
        { name: "Vinyl Wrap", category: "RESKIN" as const, unit: "unit", default_rate: "300.00" },
        { name: "Storage Fee", category: "OTHER" as const, unit: "day", default_rate: "50.00" },
        {
            name: "Cleaning Service",
            category: "OTHER" as const,
            unit: "unit",
            default_rate: "35.00",
        },
        {
            name: "Transport - Dubai (One Way)",
            category: "TRANSPORT" as const,
            unit: "trip",
            default_rate: "500.00",
        },
        {
            name: "Transport - Dubai (Round Trip)",
            category: "TRANSPORT" as const,
            unit: "trip",
            default_rate: "900.00",
        },
        {
            name: "Transport - Abu Dhabi (One Way)",
            category: "TRANSPORT" as const,
            unit: "trip",
            default_rate: "800.00",
        },
        {
            name: "Transport - Abu Dhabi (Round Trip)",
            category: "TRANSPORT" as const,
            unit: "trip",
            default_rate: "1440.00",
        },
        {
            name: "Transport - Sharjah (One Way)",
            category: "TRANSPORT" as const,
            unit: "trip",
            default_rate: "400.00",
        },
        {
            name: "Transport - Sharjah (Round Trip)",
            category: "TRANSPORT" as const,
            unit: "trip",
            default_rate: "600.00",
        },
    ];

    const allServices = baseServices.map((s, i) => ({
        platform_id: pid,
        ...s,
        display_order: i,
        is_active: true,
    }));

    const inserted = await db.insert(schema.serviceTypes).values(allServices).returning();
    S.serviceTypes = inserted;
    console.log(`✓ ${inserted.length} service types`);
}

async function seedNotificationRules() {
    console.log("🔔 Seeding notification rules...");
    const pid = S.platform.id;
    type RuleDef = {
        event_type: string;
        recipient_type: "ROLE" | "ENTITY_OWNER" | "EMAIL";
        recipient_value: string | null;
        template_key: string;
        sort_order: number;
    };
    const rules: RuleDef[] = [
        {
            event_type: "order.submitted",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "order_submitted_client",
            sort_order: 0,
        },
        {
            event_type: "order.submitted",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "order_submitted_admin",
            sort_order: 1,
        },
        {
            event_type: "order.submitted",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "order_submitted_logistics",
            sort_order: 2,
        },
        {
            event_type: "order.pending_approval",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "order_pending_approval_admin",
            sort_order: 0,
        },
        {
            event_type: "quote.sent",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "quote_sent_client",
            sort_order: 0,
        },
        {
            event_type: "quote.sent",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "quote_sent_admin",
            sort_order: 1,
        },
        {
            event_type: "quote.revised",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "quote_revised_client",
            sort_order: 0,
        },
        {
            event_type: "quote.revised",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "quote_revised_admin",
            sort_order: 1,
        },
        {
            event_type: "order.confirmed",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "order_confirmed_client",
            sort_order: 0,
        },
        {
            event_type: "order.confirmed",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "order_confirmed_admin",
            sort_order: 1,
        },
        {
            event_type: "order.confirmed",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "order_confirmed_logistics",
            sort_order: 2,
        },
        {
            event_type: "order.delivered",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "order_delivered_client",
            sort_order: 0,
        },
        {
            event_type: "workflow_request.submitted",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "workflow_request_submitted_admin",
            sort_order: 0,
        },
        {
            event_type: "workflow_request.submitted",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "workflow_request_submitted_logistics",
            sort_order: 1,
        },
        {
            event_type: "workflow_request.status_changed",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "workflow_request_status_changed_admin",
            sort_order: 0,
        },
        {
            event_type: "workflow_request.status_changed",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "workflow_request_status_changed_logistics",
            sort_order: 1,
        },
        {
            event_type: "workflow_request.completed",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "workflow_request_completed_admin",
            sort_order: 0,
        },
        {
            event_type: "workflow_request.completed",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "workflow_request_completed_logistics",
            sort_order: 1,
        },
        {
            event_type: "workflow_request.cancelled",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "workflow_request_cancelled_admin",
            sort_order: 0,
        },
        {
            event_type: "workflow_request.cancelled",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "workflow_request_cancelled_logistics",
            sort_order: 1,
        },
        {
            event_type: "order.delivered",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "order_delivered_admin",
            sort_order: 1,
        },
        {
            event_type: "order.delivered",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "order_delivered_logistics",
            sort_order: 2,
        },
        {
            event_type: "order.closed",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "order_closed_admin",
            sort_order: 0,
        },
        {
            event_type: "service_request.submitted",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "sr_submitted_admin",
            sort_order: 0,
        },
        {
            event_type: "service_request.submitted",
            recipient_type: "ROLE",
            recipient_value: "LOGISTICS",
            template_key: "sr_submitted_logistics",
            sort_order: 1,
        },
        {
            event_type: "service_request.completed",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "sr_completed_client",
            sort_order: 0,
        },
        {
            event_type: "service_request.completed",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "sr_completed_admin",
            sort_order: 1,
        },
        {
            event_type: "inbound_request.completed",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "ir_completed_client",
            sort_order: 0,
        },
        {
            event_type: "self_booking.created",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "self_booking_created_admin",
            sort_order: 0,
        },
        {
            event_type: "self_booking.completed",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "self_booking_completed_admin",
            sort_order: 0,
        },
        {
            event_type: "self_booking.cancelled",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "self_booking_cancelled_admin",
            sort_order: 0,
        },
        {
            event_type: "auth.password_reset_requested",
            recipient_type: "ENTITY_OWNER",
            recipient_value: null,
            template_key: "password_reset_otp",
            sort_order: 0,
        },
        {
            event_type: "line_item_request.submitted",
            recipient_type: "ROLE",
            recipient_value: "ADMIN",
            template_key: "line_item_request_submitted_admin",
            sort_order: 0,
        },
    ];
    await db
        .insert(schema.notificationRules)
        .values(rules.map((r) => ({ platform_id: pid, company_id: null, is_enabled: true, ...r })));
    console.log(`✓ ${rules.length} notification rules`);
}

// ============================================================
// TEAMS
// ============================================================

async function seedTeams() {
    console.log("👥 Seeding teams...");
    const teamDefs = [
        {
            name: "Abu Dhabi Team",
            description: "AD activation and warehouse crew",
            see: true,
            book: false,
        },
        {
            name: "Dubai Team",
            description: "Dubai activation and warehouse crew",
            see: true,
            book: true,
        },
    ];

    for (const def of teamDefs) {
        const [team] = await db
            .insert(schema.teams)
            .values({
                platform_id: S.platform.id,
                company_id: S.company.id,
                name: def.name,
                description: def.description,
                can_other_teams_see: def.see,
                can_other_teams_book: def.book,
            })
            .returning();
        S.teams.push(team);
        console.log(`  ✓ ${def.name}`);
    }
    console.log(`✅ ${S.teams.length} teams seeded`);
}

// ============================================================
// MAIN
// ============================================================

console.log("\n========================================");
console.log("PERNOD RICARD — PRODUCTION SETUP SEED");
console.log("========================================\n");

async function main() {
    try {
        console.log("🚀 Starting PR seed...\n");

        await cleanup();

        // Phase 1: Infrastructure
        await seedPlatform();
        await seedAccessPolicies();
        await seedCompany();
        await seedCountriesAndCities();
        await seedCompanyDomains();
        await seedWarehouse();
        await seedUsers();
        await seedAttachmentTypes();
        await seedWorkflowDefinitions();
        await seedBrands();
        await seedZones();

        // Phase 2: Operational config
        await seedServiceTypes();
        await seedNotificationRules();

        // Phase 3: Teams
        await seedTeams();

        // Phase 4: PR assets from thin-MVP bundle
        await seedPrAssets({
            platformId: S.platform.id,
            companyId: S.company.id,
            warehouseId: S.warehouse.id,
            zoneId: S.zones[0].id,
            verbose: true,
        });

        console.log("\n✅ PR SEED COMPLETE!\n");
        console.log("📊 Summary:");
        console.log(`  Platform : ${S.platform.name}`);
        console.log(`  Company  : ${S.company.name}`);
        console.log(`  Users    : ${S.users.length}`);
        console.log(`    admin@test.com / password123`);
        console.log(`    logistics@test.com / password123`);
        console.log(`    client@pernod-ricard.com / password123`);
        console.log(`  Brands   : ${S.brands.length}`);
        console.log(`  Warehouse: ${S.warehouse.name}`);
        console.log(`  Zones    : ${S.zones.length}`);
        console.log();
        process.exit(0);
    } catch (err) {
        console.error("❌ Seed failed:", err);
        process.exit(1);
    }
}

main();
