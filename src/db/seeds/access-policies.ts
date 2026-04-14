/**
 * Shared seed module: access policies.
 *
 * Thin wrapper over PlatformBootstrapService.bootstrapPlatform so any seed
 * (test, pr, demo) composes the same authoritative bootstrap — no inline
 * re-implementation. Creates the three default policies (ADMIN, LOGISTICS,
 * CLIENT) and optionally the system user.
 *
 * Consumers: src/db/seed-test.ts
 * Future consumers: src/db/seed.ts, seed-pr.ts, seed-demo-pr.ts (separate
 * refactor task per docs/e2e-testing-system.md §12 decision 6).
 */

import { PlatformBootstrapService } from "../../app/services/platform-bootstrap.service";

export type SeedAccessPoliciesOpts = {
    platformId: string;
    createSystemUser?: boolean;
};

export const seedAccessPolicies = async (opts: SeedAccessPoliciesOpts) => {
    const { policies, systemUser } = await PlatformBootstrapService.bootstrapPlatform({
        platformId: opts.platformId,
        createSystemUser: opts.createSystemUser ?? true,
    });
    return { policies, systemUser };
};
