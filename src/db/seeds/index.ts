/**
 * Barrel exports for shared seed modules.
 *
 * These modules encode the canonical "scaffolding" data (access policies,
 * service types, notification rules, attachment types, workflow definitions)
 * that every tenant/seed needs. seed-test.ts composes them; future refactors
 * of seed.ts / seed-pr.ts / seed-demo-pr.ts can switch to importing from here
 * to eliminate duplication (separate task, see docs/e2e-testing-system.md §12
 * decision 6).
 */

export { seedAccessPolicies, type SeedAccessPoliciesOpts } from "./access-policies";
export {
    seedServiceTypes,
    CANONICAL_SERVICE_TYPES,
    type SeedServiceTypesOpts,
} from "./service-types";
export {
    seedAttachmentTypes,
    CANONICAL_ATTACHMENT_TYPES,
    type SeedAttachmentTypesOpts,
} from "./attachment-types";
export {
    seedWorkflowDefinitions,
    CANONICAL_WORKFLOW_DEFINITIONS,
    type SeedWorkflowDefinitionsOpts,
} from "./workflow-definitions";
export {
    seedNotificationRules,
    PLATFORM_DEFAULT_NOTIFICATION_RULES,
    type SeedNotificationRulesOpts,
} from "./notification-rules";
export {
    seedAssetCategories,
    CANONICAL_ASSET_CATEGORIES,
    type SeedAssetCategoriesOpts,
} from "./asset-categories";

// Demo-seed helpers (deterministic IDs + timestamps for docs screenshots)
export { DEMO_EPOCH, daysFromEpoch, DEMO_UUIDS, DEMO_ORDER_IDS } from "./demo-deterministic";
export { seedDemoCatalog, type SeedDemoCatalogOpts, type SeededCatalog } from "./demo-catalog";
export { seedDemoOrders, type SeedDemoOrdersOpts, type SeededOrders } from "./demo-orders";
export { seedDemoScanEvents, type SeedDemoScanEventsOpts } from "./demo-scan-events";
export { seedDemoServiceRequest, type SeedDemoServiceRequestOpts } from "./demo-service-request";
