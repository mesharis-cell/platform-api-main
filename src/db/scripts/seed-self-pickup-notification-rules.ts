/**
 * One-time operational script: seed notification rules for self-pickup and
 * stock threshold events.
 *
 * Run once per platform after migration 0038.
 *
 * Usage:
 *   bunx tsx src/db/scripts/seed-redbull-notification-rules.ts
 */

import { db } from "..";
import { notificationRules, platforms } from "../schema";
// drizzle-orm not needed for this script

const SELF_PICKUP_RULES = [
    {
        event_type: "self_pickup.submitted",
        recipient_type: "ENTITY_OWNER" as const,
        recipient_value: null,
        template_key: "self_pickup_submitted_client",
    },
    {
        event_type: "self_pickup.submitted",
        recipient_type: "ROLE" as const,
        recipient_value: "ADMIN",
        template_key: "self_pickup_submitted_admin",
    },
    {
        event_type: "self_pickup.submitted",
        recipient_type: "ROLE" as const,
        recipient_value: "LOGISTICS",
        template_key: "self_pickup_submitted_logistics",
    },
    {
        event_type: "self_pickup.quoted",
        recipient_type: "ENTITY_OWNER" as const,
        recipient_value: null,
        template_key: "self_pickup_quoted_client",
    },
    {
        event_type: "self_pickup.confirmed",
        recipient_type: "ROLE" as const,
        recipient_value: "ADMIN",
        template_key: "self_pickup_confirmed_admin",
    },
    {
        event_type: "self_pickup.confirmed",
        recipient_type: "ROLE" as const,
        recipient_value: "LOGISTICS",
        template_key: "self_pickup_confirmed_logistics",
    },
    {
        event_type: "self_pickup.ready_for_pickup",
        recipient_type: "ENTITY_OWNER" as const,
        recipient_value: null,
        template_key: "self_pickup_ready_client",
    },
    {
        event_type: "self_pickup.return_due",
        recipient_type: "ENTITY_OWNER" as const,
        recipient_value: null,
        template_key: "self_pickup_return_due_client",
    },
    {
        event_type: "self_pickup.return_due",
        recipient_type: "ROLE" as const,
        recipient_value: "LOGISTICS",
        template_key: "self_pickup_return_due_logistics",
    },
    {
        event_type: "self_pickup.picked_up",
        recipient_type: "ROLE" as const,
        recipient_value: "ADMIN",
        template_key: "self_pickup_picked_up_admin",
    },
    {
        event_type: "self_pickup.closed",
        recipient_type: "ROLE" as const,
        recipient_value: "ADMIN",
        template_key: "self_pickup_closed_admin",
    },
    {
        event_type: "self_pickup.cancelled",
        recipient_type: "ROLE" as const,
        recipient_value: "ADMIN",
        template_key: "self_pickup_cancelled_admin",
    },
    {
        event_type: "stock.below_threshold",
        recipient_type: "ROLE" as const,
        recipient_value: "ADMIN",
        template_key: "stock_below_threshold_admin",
    },
    {
        event_type: "stock.below_threshold",
        recipient_type: "ROLE" as const,
        recipient_value: "LOGISTICS",
        template_key: "stock_below_threshold_logistics",
    },
];

async function main() {
    console.log("🔔 Seeding Red Bull build notification rules...\n");

    const allPlatforms = await db.select({ id: platforms.id, name: platforms.name }).from(platforms).execute();

    for (const platform of allPlatforms) {
        console.log(`  Platform: ${platform.name} (${platform.id})`);
        let created = 0;

        for (const rule of SELF_PICKUP_RULES) {
            try {
                await db.insert(notificationRules).values({
                    platform_id: platform.id,
                    event_type: rule.event_type,
                    company_id: null,
                    recipient_type: rule.recipient_type,
                    recipient_value: rule.recipient_value,
                    template_key: rule.template_key,
                    is_enabled: true,
                    sort_order: 0,
                });
                created++;
            } catch (err: any) {
                // Skip duplicate if already seeded
                if (err?.code === "23505") continue;
                throw err;
            }
        }

        console.log(`    ✅ Created ${created} notification rules`);
    }

    console.log("\n✅ Done.");
    process.exit(0);
}

main().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
