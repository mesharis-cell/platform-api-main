import "dotenv/config";
import { assertAppEnv } from "../safety/guards";
import { Pool } from "pg";

assertAppEnv(["staging"]);

type StalePattern = {
    policyCode: "LOGISTICS_DEFAULT" | "CLIENT_DEFAULT";
    permissionGrants: string[];
    permissionRevokes: string[];
};

type UserRow = {
    id: string;
    email: string;
    role: string;
    permission_grants: string[] | null;
    permission_revokes: string[] | null;
    access_policy_code: string | null;
};

const STALE_PATTERNS: StalePattern[] = [
    {
        policyCode: "LOGISTICS_DEFAULT",
        permissionGrants: ["auth:*", "inbound_request:*"],
        permissionRevokes: [
            "assets:availability_stats",
            "assets:check_availability",
            "assets:scan_history",
            "auth:login",
            "auth:reset_password",
            "brands:update",
            "calendar:read",
            "countries:read",
            "invoices:download",
            "orders:add_job_number",
            "orders:export",
            "orders:view_status_history",
            "zones:delete",
        ],
    },
    {
        policyCode: "CLIENT_DEFAULT",
        permissionGrants: ["auth:*", "self_bookings:*"],
        permissionRevokes: [
            "assets:availability_stats",
            "assets:check_availability",
            "auth:login",
            "auth:reset_password",
            "calendar:read",
            "countries:read",
            "orders:view_status_history",
        ],
    },
];

const normalize = (permissions: string[] | null | undefined) =>
    [...new Set(permissions ?? [])].sort((a, b) => a.localeCompare(b));

const samePermissions = (a: string[] | null | undefined, b: string[]) => {
    const left = normalize(a);
    const right = normalize(b);
    return left.length === right.length && left.every((permission, index) => permission === right[index]);
};

async function main() {
    const apply = process.argv.includes("--apply");
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    try {
        const result = await pool.query<UserRow>(`
            select
                u.id,
                u.email,
                u.role,
                u.permission_grants,
                u.permission_revokes,
                ap.code as access_policy_code
            from users u
            left join access_policies ap
                on ap.id = u.access_policy_id
        `);

        const matches = result.rows.filter((user) =>
            STALE_PATTERNS.some(
                (pattern) =>
                    user.access_policy_code === pattern.policyCode &&
                    samePermissions(user.permission_grants, pattern.permissionGrants) &&
                    samePermissions(user.permission_revokes, pattern.permissionRevokes)
            )
        );

        if (!apply) {
            console.log(
                JSON.stringify(
                    {
                        apply: false,
                        matched_users: matches.length,
                        users: matches.map((user) => ({
                            id: user.id,
                            email: user.email,
                            role: user.role,
                            access_policy_code: user.access_policy_code,
                            permission_grants: normalize(user.permission_grants),
                            permission_revokes: normalize(user.permission_revokes),
                        })),
                    },
                    null,
                    2
                )
            );
            return;
        }

        for (const user of matches) {
            await pool.query(
                `
                    update users
                    set permission_grants = ARRAY[]::text[],
                        permission_revokes = ARRAY[]::text[]
                    where id = $1
                `,
                [user.id]
            );
        }

        console.log(
            JSON.stringify(
                {
                    apply: true,
                    cleaned_users: matches.length,
                    emails: matches.map((user) => user.email),
                },
                null,
                2
            )
        );
    } finally {
        await pool.end();
    }
}

main().catch((error) => {
    console.error(
        "❌ stale default override cleanup failed:",
        error instanceof Error ? error.message : error
    );
    process.exit(1);
});
