import httpStatus from "http-status";
import { sortOrderType } from "../../constants/common";
import CustomizedError from "../../error/customized-error";

export const userSortableFields = [
  "name",
  "email",
  "created_at",
  "updated_at",
  "role",
];

export const userQueryValidationConfig = {
  sort_by: userSortableFields,
  sort_order: sortOrderType,
};

export const userPermissionTemplates = {
  PLATFORM_ADMIN: {
    permissions: [
      "auth:*",
      "users:*",
      "companies:*",
      "brands:*",
      "warehouses:*",
      "zones:*",
      "pricing_tiers:*",
      "orders:*",
      "pricing:*",
      "invoices:*",
      "lifecycle:*",
      "notifications:*",
      "analytics:*",
      "system:*",
      "assets:*",
      "collections:*",
      "conditions:*",
      "inventory:*",
      "quotes:*",
      "scanning:*",
    ],
    defaultCompanies: ["*"],
  },
  LOGISTICS_STAFF: {
    permissions: [
      "auth:*",
      "users:read",
      "companies:read",
      "brands:read",
      "warehouses:read",
      "zones:read",
      "assets:*",
      "collections:*",
      "orders:read",
      "orders:update",
      "orders:add_time_windows", // Phase 10
      "pricing:review",
      "pricing:approve_standard",
      "pricing:adjust",
      "lifecycle:progress_status", // Phase 10
      "lifecycle:receive_notifications", // Phase 10
      "scanning:*",
      "inventory:*",
      "conditions:*",
    ],
    defaultCompanies: ["*"],
  },
  CLIENT_USER: {
    permissions: [
      "auth:*",
      "companies:read",
      "brands:read",
      "assets:read",
      "collections:read",
      "orders:create",
      "orders:read",
      "orders:update",
      "quotes:approve",
      "quotes:decline",
      "invoices:read",
      "invoices:download",
      "lifecycle:receive_notifications",
    ],
    defaultCompanies: [], // Will be set to specific company on creation
  },
};



export const allowedTemplatesForRole: Record<string, string> = {
  ADMIN: "PLATFORM_ADMIN",
  LOGISTICS: "LOGISTICS_STAFF",
  CLIENT: "CLIENT_USER",
};

export const validateRoleAndTemplate = (
  role: string,
  template: string | null | undefined
) => {
  if (!template) return;

  const allowedTemplate = allowedTemplatesForRole[role];
  if (template !== allowedTemplate) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      `Role '${role}' can only have '${allowedTemplate}' permission template`
    );
  }
};

export const resolveUserPermissions = (
  template: string | null | undefined,
  permissions: string[] = []
): string[] => {
  if (
    template &&
    userPermissionTemplates[template as keyof typeof userPermissionTemplates]
  ) {
    return userPermissionTemplates[
      template as keyof typeof userPermissionTemplates
    ].permissions;
  }
  return permissions;
};
