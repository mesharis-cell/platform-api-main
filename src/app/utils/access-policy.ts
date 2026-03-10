import httpStatus from "http-status";
import { PERMISSION_TEMPLATES } from "../constants/permissions";
import CustomizedError from "../error/customized-error";

export type AccessPolicyRole = "ADMIN" | "LOGISTICS" | "CLIENT";

export const DEFAULT_ACCESS_POLICY_CODES: Record<AccessPolicyRole, string> = {
    ADMIN: "ADMIN_DEFAULT",
    LOGISTICS: "LOGISTICS_DEFAULT",
    CLIENT: "CLIENT_DEFAULT",
};

export const DEFAULT_ACCESS_POLICIES = [
    {
        code: DEFAULT_ACCESS_POLICY_CODES.ADMIN,
        role: "ADMIN" as const,
        name: "Admin Default",
        description: "Full default platform administration access",
        permissions: PERMISSION_TEMPLATES.PLATFORM_ADMIN,
    },
    {
        code: DEFAULT_ACCESS_POLICY_CODES.LOGISTICS,
        role: "LOGISTICS" as const,
        name: "Logistics Default",
        description: "Default logistics and warehouse operations access",
        permissions: PERMISSION_TEMPLATES.LOGISTICS_STAFF,
    },
    {
        code: DEFAULT_ACCESS_POLICY_CODES.CLIENT,
        role: "CLIENT" as const,
        name: "Client Default",
        description: "Default client portal access",
        permissions: PERMISSION_TEMPLATES.CLIENT_USER,
    },
];

export type EffectivePermissionInput = {
    accessPolicyPermissions?: string[] | null;
    permissionGrants?: string[] | null;
    permissionRevokes?: string[] | null;
    legacyPermissions?: string[] | null;
};

export const computeEffectivePermissions = ({
    accessPolicyPermissions,
    permissionGrants,
    permissionRevokes,
    legacyPermissions,
}: EffectivePermissionInput): string[] => {
    const base = accessPolicyPermissions?.length
        ? accessPolicyPermissions
        : (legacyPermissions ?? []);
    const granted = permissionGrants ?? [];
    const revokedSet = new Set(permissionRevokes ?? []);

    return [...new Set([...base, ...granted])].filter((permission) => !revokedSet.has(permission));
};

export const assertPolicyMatchesRole = (
    role: AccessPolicyRole,
    accessPolicy:
        | {
              id: string;
              role: AccessPolicyRole;
              is_active?: boolean;
          }
        | null
        | undefined
) => {
    if (!accessPolicy) return;
    if (accessPolicy.role !== role) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Access policy does not match ${role} role`
        );
    }
    if (accessPolicy.is_active === false) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Access policy is inactive");
    }
};
