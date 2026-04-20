/**
 * E2E test tenant seed.
 *
 * Composes shared scaffolding modules (src/db/seeds/) + test-specific tenant
 * data (company with locked feature flags, three Outlook-aliased role users,
 * minimal warehouse/brand/assets). Scenarios create their own orders — this
 * script seeds NO orders, NO service requests, NO inbound requests.
 *
 * Run:
 *   bun run db:seed:test
 *
 * Preconditions:
 *   1. APP_ENV=testing set (via package.json script prefix)
 *   2. Test DB has the `_e2e_test_db_marker` row (run `db:bootstrap:test` once)
 *   3. assertIsTestDatabase() passes (the marker is the authority)
 *
 * Safe to re-run: wipes and re-seeds everything except the marker and drizzle
 * migration metadata. Marker survives, so subsequent runs pass the safety gate.
 */

// ENV MUST be loaded via `bun --preload ./src/bootstrap/env-preload.ts`
// before this module loads. ES module hoisting means inline env overrides run
// AFTER imports, too late to affect the shared db pool's connection string.
import bcrypt from "bcrypt";
import { sql } from "drizzle-orm";
import { companyFeatures } from "../app/constants/common";
import { DEFAULT_ACCESS_POLICY_CODES } from "../app/utils/access-policy";
import { db } from "./index";
import * as schema from "./schema";
import {
    DEMO_UUIDS,
    seedAccessPolicies,
    seedAssetCategories,
    seedAttachmentTypes,
    seedDemoCatalog,
    seedDemoOrders,
    seedDemoScanEvents,
    seedDemoServiceRequest,
    seedNotificationRules,
    seedServiceTypes,
    seedWorkflowDefinitions,
} from "./seeds";
import { assertAppEnv, assertIsTestDatabase, MARKER_TABLE } from "./safety/guards";

// Fail fast if APP_ENV isn't "testing". The marker-row check in main()
// provides the second, stronger gate (only the test DB holds the marker).
assertAppEnv(["testing"]);

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const TEST_PLATFORM = {
    name: "Kadence",
    domain: "demo.kadence.test",
    // Must match a domain verified on the test Resend API key. Current verified
    // domain: notifications.staging.kadence.ae. If the test key ever rotates to
    // a different verified sender, update here + seed config will flow through.
    from_email: "no-reply@notifications.staging.kadence.ae",
    currency: "AED",
};

const TEST_COMPANY_NAME = "Kadence Demo";
const TEST_COMPANY_HOSTNAME = "demo.kadence.test";

// Feature flags — per docs/e2e-testing-system.md §12 decision 1.
// companyFeatures already has the intended defaults (attachments/workflows/
// base_operations ON, self_pickup/kadence_invoicing OFF). Explicit spread here
// so anyone reading seed-test.ts sees the invariant locally, not via defaults.
const TEST_TENANT_FEATURES = {
    ...companyFeatures,
    enable_attachments: true,
    enable_workflows: true,
    enable_base_operations: true,
    enable_self_pickup: true,
    enable_kadence_invoicing: false,
};

// Display names are demo-friendly so screenshots + scan-event actor names look
// like real humans. Emails remain the stakeholder's real Outlook aliases so
// E2E email-delivery tests keep landing mail in receivable inboxes.
// `docsClient` is a second CLIENT user on the same company that only exists
// for docs-site screenshots — emails do NOT reach anywhere real (fake domain),
// but that's fine: docs doesn't exercise email flows.
const TEST_USERS = {
    admin: {
        name: "Morgan Lee",
        email: "e2e.kadence.admin@homeofpmg.com",
        password: "E2ePass!Admin1",
        role: "ADMIN" as const,
        company_scoped: false,
    },
    logistics: {
        name: "Jordan Maxwell",
        email: "e2e.kadence.logistics@homeofpmg.com",
        password: "E2ePass!Logi1",
        role: "LOGISTICS" as const,
        company_scoped: false,
    },
    client: {
        name: "E2E Client",
        email: "e2e.kadence.client@homeofpmg.com",
        password: "E2ePass!Client1",
        role: "CLIENT" as const,
        company_scoped: true,
    },
    docsClient: {
        name: "Alex Chen",
        email: "alex.chen@kadence-demo.com",
        password: "DocsPass!Client1",
        role: "CLIENT" as const,
        company_scoped: true,
    },
};

const PROTECTED_TABLES = new Set([MARKER_TABLE, "__drizzle_migrations"]);

// ─────────────────────────────────────────────────────────────
// Wipe — everything except the marker and migration metadata.
// ─────────────────────────────────────────────────────────────

const wipeAllExceptMarker = async () => {
    console.log("🧹 Wiping test DB (preserving marker + migration metadata)...");
    const result: any = await db.execute(sql.raw(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
    `));
    const rows = (result?.rows ?? result ?? []) as Array<{ tablename: string }>;
    const toTruncate = rows
        .map((r) => r.tablename)
        .filter((t) => !PROTECTED_TABLES.has(t))
        .map((t) => `"${t}"`);

    if (toTruncate.length === 0) {
        console.log("  (no tables to truncate — fresh DB)");
        return;
    }

    await db.execute(
        sql.raw(`TRUNCATE TABLE ${toTruncate.join(", ")} RESTART IDENTITY CASCADE`)
    );
    console.log(`  ✓ truncated ${toTruncate.length} tables`);
};

// ─────────────────────────────────────────────────────────────
// Seed steps
// ─────────────────────────────────────────────────────────────

const seedPlatform = async () => {
    console.log("🌐 Seeding platform...");
    const [platform] = await db
        .insert(schema.platforms)
        .values({
            id: DEMO_UUIDS.platform,
            name: TEST_PLATFORM.name,
            domain: TEST_PLATFORM.domain,
            config: {
                from_email: TEST_PLATFORM.from_email,
                currency: TEST_PLATFORM.currency,
                feasibility: {
                    minimum_lead_hours: 0,
                    exclude_weekends: false,
                    weekend_days: [0, 6],
                    timezone: "Asia/Dubai",
                },
            },
            features: TEST_TENANT_FEATURES,
            is_active: true,
        })
        .returning();
    console.log(`  ✓ platform: ${platform.name}`);
    return platform;
};

const seedGeography = async (platformId: string) => {
    console.log("🌍 Seeding country + city...");
    const [country] = await db
        .insert(schema.countries)
        .values({ platform_id: platformId, name: "United Arab Emirates" })
        .returning();
    const [city] = await db
        .insert(schema.cities)
        .values({ platform_id: platformId, country_id: country.id, name: "Dubai" })
        .returning();
    console.log(`  ✓ country + city (Dubai)`);
    return { country, city };
};

const seedWarehouseAndZone = async (platformId: string, companyId: string) => {
    console.log("🏭 Seeding warehouse + zone...");
    const [warehouse] = await db
        .insert(schema.warehouses)
        .values({
            platform_id: platformId,
            name: "E2E Warehouse",
            country: "UAE",
            city: "Dubai",
            address: "E2E Test Address, Dubai, UAE",
            is_active: true,
        })
        .returning();
    const [zone] = await db
        .insert(schema.zones)
        .values({
            platform_id: platformId,
            warehouse_id: warehouse.id,
            company_id: companyId,
            name: "Zone A",
            description: "E2E test zone",
            capacity: 1000,
            is_active: true,
        })
        .returning();
    console.log(`  ✓ warehouse + zone`);
    return { warehouse, zone };
};

const seedCompany = async (platformId: string) => {
    console.log("🏢 Seeding test company...");
    const [company] = await db
        .insert(schema.companies)
        .values({
            id: DEMO_UUIDS.company,
            platform_id: platformId,
            name: TEST_COMPANY_NAME,
            domain: "kadence-demo",
            settings: {
                branding: {
                    title: TEST_COMPANY_NAME,
                    primary_color: "#6b7280",
                    secondary_color: "#9ca3af",
                },
            },
            features: TEST_TENANT_FEATURES,
            platform_margin_percent: "25.00",
            warehouse_ops_rate: "10.00",
            contact_email: "e2e.kadence.admin@homeofpmg.com",
            contact_phone: "+971-50-000-0000",
            is_active: true,
        })
        .returning();
    console.log(`  ✓ company: ${company.name}`);
    return company;
};

const seedCompanyDomain = async (platformId: string, companyId: string) => {
    console.log("🔗 Seeding company domain...");
    await db.insert(schema.companyDomains).values({
        platform_id: platformId,
        company_id: companyId,
        hostname: TEST_COMPANY_HOSTNAME,
        type: "VANITY",
        is_verified: true,
        is_active: true,
        is_primary: true,
    });
    console.log(`  ✓ primary domain: ${TEST_COMPANY_HOSTNAME}`);
};

const seedUsers = async (
    platformId: string,
    companyId: string,
    policies: Array<{ id: string; code: string }>
) => {
    console.log("👥 Seeding users...");
    const policyByCode = (code: string) => {
        const p = policies.find((x) => x.code === code);
        if (!p) throw new Error(`Access policy not found: ${code}`);
        return p;
    };

    const hashed = await Promise.all(
        Object.values(TEST_USERS).map(async (u) => ({ ...u, password: await bcrypt.hash(u.password, 10) }))
    );

    const [admin, logistics, client, docsClient] = hashed;
    const inserted = await db
        .insert(schema.users)
        .values([
            {
                platform_id: platformId,
                company_id: null,
                name: admin.name,
                email: admin.email,
                password: admin.password,
                role: admin.role,
                permissions: [],
                access_policy_id: policyByCode(DEFAULT_ACCESS_POLICY_CODES.ADMIN).id,
                is_active: true,
            },
            {
                platform_id: platformId,
                company_id: null,
                name: logistics.name,
                email: logistics.email,
                password: logistics.password,
                role: logistics.role,
                permissions: [],
                access_policy_id: policyByCode(DEFAULT_ACCESS_POLICY_CODES.LOGISTICS).id,
                is_active: true,
            },
            {
                platform_id: platformId,
                company_id: companyId,
                name: client.name,
                email: client.email,
                password: client.password,
                role: client.role,
                permissions: [],
                access_policy_id: policyByCode(DEFAULT_ACCESS_POLICY_CODES.CLIENT).id,
                is_active: true,
            },
            {
                id: DEMO_UUIDS.users.docsClient,
                platform_id: platformId,
                company_id: companyId,
                name: docsClient.name,
                email: docsClient.email,
                password: docsClient.password,
                role: docsClient.role,
                permissions: [],
                access_policy_id: policyByCode(DEFAULT_ACCESS_POLICY_CODES.CLIENT).id,
                is_active: true,
            },
        ])
        .returning();
    console.log(`  ✓ ${inserted.length} users (admin / logistics / e2e-client / docs-client)`);
    return inserted;
};

const seedBrands = async (platformId: string, companyId: string) => {
    console.log("🏷️  Seeding brands...");
    const inserted = await db
        .insert(schema.brands)
        .values([
            {
                id: DEMO_UUIDS.brands.primary,
                platform_id: platformId,
                company_id: companyId,
                name: "Kadence Events",
                description: "Primary brand for demo tenant",
                logo_url: "https://placehold.co/400x200/4b5563/FFFFFF?text=Kadence+Events",
                is_active: true,
            },
            {
                id: DEMO_UUIDS.brands.secondary,
                platform_id: platformId,
                company_id: companyId,
                name: "Kadence Studio",
                description: "Secondary brand for multi-brand flows",
                logo_url: "https://placehold.co/400x200/6b7280/FFFFFF?text=Kadence+Studio",
                is_active: true,
            },
        ])
        .returning();
    console.log(`  ✓ ${inserted.length} brands`);
    return inserted;
};

// Catalog seeding moved to src/db/seeds/demo-catalog.ts so it can grow with
// the docs agent's screenshot needs without bloating this composition file.

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

const main = async () => {
    console.log("\n========================================");
    console.log("KADENCE E2E TEST SEED");
    console.log("========================================\n");

    const targetRef = (process.env.DATABASE_URL ?? "").match(/postgres\.([a-z0-9]+)/)?.[1] ?? "<non-supabase>";
    console.log(`→ Target DB ref: ${targetRef}\n`);

    await assertIsTestDatabase();
    console.log("✓ Test DB marker verified.\n");

    await wipeAllExceptMarker();
    console.log();

    const platform = await seedPlatform();
    const { policies } = await seedAccessPolicies({ platformId: platform.id });
    console.log(`  ✓ ${policies.length} access policies`);

    await seedServiceTypes({ platformId: platform.id });
    console.log("  ✓ service types");
    await seedAttachmentTypes({ platformId: platform.id });
    console.log("  ✓ attachment types");
    await seedWorkflowDefinitions({ platformId: platform.id });
    console.log("  ✓ workflow definitions");
    await seedNotificationRules({ platformId: platform.id });
    console.log("  ✓ notification rules");
    await seedAssetCategories({ platformId: platform.id });
    console.log("  ✓ asset categories (6 universal)");

    const { city } = await seedGeography(platform.id);
    const company = await seedCompany(platform.id);
    await seedCompanyDomain(platform.id, company.id);
    const { warehouse, zone } = await seedWarehouseAndZone(platform.id, company.id);
    const users = await seedUsers(platform.id, company.id, policies);
    const brands = await seedBrands(platform.id, company.id);
    const catalog = await seedDemoCatalog({
        platformId: platform.id,
        companyId: company.id,
        warehouseId: warehouse.id,
        zoneId: zone.id,
        brandPrimaryId: DEMO_UUIDS.brands.primary,
        brandSecondaryId: DEMO_UUIDS.brands.secondary,
    });

    // Look up admin + logistics user IDs (their UUIDs are random — only docs
    // client has a fixed UUID since demo orders reference it).
    const adminUser = users.find((u) => u.email === TEST_USERS.admin.email);
    const logisticsUser = users.find((u) => u.email === TEST_USERS.logistics.email);
    if (!adminUser || !logisticsUser) {
        throw new Error("Admin or logistics user not found after seedUsers — seed inconsistent.");
    }

    await seedDemoOrders({
        platformId: platform.id,
        companyId: company.id,
        brandId: DEMO_UUIDS.brands.primary,
        cityId: city.id,
        countryName: "United Arab Emirates",
        cityName: "Dubai",
        clientUserId: DEMO_UUIDS.users.docsClient,
        adminUserId: adminUser.id,
        logisticsUserId: logisticsUser.id,
        pooledAsset: {
            id: catalog.assets.eventChairsBatch.id,
            name: "Event Chair (batch)",
            weightPerUnit: "3.20",
            volumePerUnit: "0.203",
        },
        backdropAsset: {
            id: catalog.assets.backdropGreen1.id,
            name: "Backdrop Panel #1",
            weightPerUnit: "12.00",
            volumePerUnit: "5.000",
        },
        ledAsset: {
            id: catalog.assets.ledScreen1.id,
            name: "LED Screen #1",
            weightPerUnit: "8.50",
            volumePerUnit: "0.020",
        },
    });

    await seedDemoScanEvents({ logisticsUserId: logisticsUser.id });
    await seedDemoServiceRequest({
        platformId: platform.id,
        companyId: company.id,
        adminUserId: adminUser.id,
        logisticsUserId: logisticsUser.id,
    });

    console.log("\n✅ E2E TEST SEED COMPLETE\n");
    console.log("Summary:");
    console.log(`  Platform : ${platform.name} (${platform.domain})`);
    console.log(`  Company  : ${company.name}`);
    console.log(`  Users    : ${users.length}`);
    for (const u of Object.values(TEST_USERS)) {
        console.log(`    ${u.role.padEnd(10)} ${u.email} / ${u.password}`);
    }
    console.log(`  Brands   : ${brands.length}`);
    console.log(`  Warehouse: ${warehouse.name} — zone ${zone.name}\n`);
    console.log(`  Orders   : 6 demo orders (ORD-DEMO-001…006) on Alex Chen — see src/db/seeds/demo-orders.ts\n`);
    process.exit(0);
};

main().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
