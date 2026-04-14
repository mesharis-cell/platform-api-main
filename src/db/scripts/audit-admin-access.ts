import "dotenv/config";
import { assertAppEnv } from "../safety/guards";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { accessPolicies, users } from "../../db/schema";
import { isValidPermission } from "../../app/constants/permissions";

assertAppEnv(["staging", "production"]);

const listInvalidPermissions = (permissions: string[] | null | undefined) =>
    (permissions ?? []).filter((permission) => !isValidPermission(permission));

async function main() {
    const policies = await db.select().from(accessPolicies).where(eq(accessPolicies.role, "ADMIN"));

    const adminUsers = await db.query.users.findMany({
        where: eq(users.role, "ADMIN"),
        with: {
            access_policy: {
                columns: {
                    code: true,
                    name: true,
                    permissions: true,
                },
            },
        },
        columns: {
            id: true,
            platform_id: true,
            email: true,
            access_policy_id: true,
            permissions: true,
            permission_grants: true,
            permission_revokes: true,
            is_super_admin: true,
        },
    });

    console.log(
        JSON.stringify(
            {
                policies: policies.map((policy) => ({
                    id: policy.id,
                    platform_id: policy.platform_id,
                    code: policy.code,
                    name: policy.name,
                    permissions_count: policy.permissions.length,
                    invalid_permissions: listInvalidPermissions(policy.permissions),
                })),
                users: adminUsers.map((user) => ({
                    id: user.id,
                    platform_id: user.platform_id,
                    email: user.email,
                    access_policy_id: user.access_policy_id,
                    access_policy_code: user.access_policy?.code ?? null,
                    is_super_admin: user.is_super_admin,
                    legacy_permissions_count: user.permissions.length,
                    invalid_legacy_permissions: listInvalidPermissions(user.permissions),
                    permission_grants_count: user.permission_grants.length,
                    invalid_permission_grants: listInvalidPermissions(user.permission_grants),
                    permission_revokes_count: user.permission_revokes.length,
                    invalid_permission_revokes: listInvalidPermissions(user.permission_revokes),
                })),
            },
            null,
            2
        )
    );
}

main().catch((error) => {
    console.error("❌ admin access audit failed:", error instanceof Error ? error.message : error);
    process.exit(1);
});
