import "dotenv/config";
import { assertAppEnv } from "../safety/guards";
import { PlatformServices } from "../../app/modules/platform/platform.services";

assertAppEnv(["staging"]);

const getArg = (name: string) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
};

const parseJsonArg = (value: string | undefined, label: string) => {
    if (!value) return undefined;
    try {
        return JSON.parse(value);
    } catch {
        throw new Error(`${label} must be valid JSON`);
    }
};

async function main() {
    const name = getArg("name");
    const domain = getArg("domain");

    if (!name || !domain) {
        throw new Error(
            "Usage: bun run db:platform:create -- --name <platform-name> --domain <platform-domain> [--config '{...}'] [--features '{...}'] [--inactive]"
        );
    }

    const platform = await PlatformServices.createPlatform({
        name,
        domain,
        config: parseJsonArg(getArg("config"), "config"),
        features: parseJsonArg(getArg("features"), "features"),
        is_active: !process.argv.includes("--inactive"),
    });

    console.log(
        JSON.stringify(
            {
                id: platform.id,
                name: platform.name,
                domain: platform.domain,
                is_active: platform.is_active,
            },
            null,
            2
        )
    );
}

main().catch((error) => {
    console.error("❌ platform create failed:", error instanceof Error ? error.message : error);
    process.exit(1);
});
