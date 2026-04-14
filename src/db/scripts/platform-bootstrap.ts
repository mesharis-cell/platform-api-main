import "dotenv/config";
import { assertAppEnv } from "../safety/guards";
import { PlatformBootstrapService } from "../../app/services/platform-bootstrap.service";

assertAppEnv(["staging"]);

const getArg = (name: string) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
};

async function main() {
    const platformId = getArg("platform-id");

    if (!platformId) {
        throw new Error(
            "Usage: bun run db:platform:bootstrap -- --platform-id <uuid> [--admin-name <name> --admin-email <email> --admin-password <password>] [--skip-system-user]"
        );
    }

    const adminName = getArg("admin-name");
    const adminEmail = getArg("admin-email");
    const adminPassword = getArg("admin-password");
    const hasAdminArgs = Boolean(adminName || adminEmail || adminPassword);

    if (hasAdminArgs && (!adminName || !adminEmail || !adminPassword)) {
        throw new Error(
            "When creating an initial admin you must provide --admin-name, --admin-email, and --admin-password"
        );
    }

    const result = await PlatformBootstrapService.bootstrapPlatform({
        platformId,
        createSystemUser: !process.argv.includes("--skip-system-user"),
        initialAdmin: hasAdminArgs
            ? {
                  name: adminName!,
                  email: adminEmail!,
                  password: adminPassword!,
              }
            : undefined,
    });

    console.log(
        JSON.stringify(
            {
                platform_id: platformId,
                policies_created_or_present: result.policies.length,
                system_user_email: result.systemUser?.email ?? null,
                initial_admin_email: result.adminUser?.email ?? null,
            },
            null,
            2
        )
    );
}

main().catch((error) => {
    console.error("❌ platform bootstrap failed:", error instanceof Error ? error.message : error);
    process.exit(1);
});
