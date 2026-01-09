import httpStatus from "http-status";
import CustomizedError from "../error/customized-error";
import { getAllPermissions, PERMISSION_TEMPLATES } from "../constants/permissions";
import { allowedTemplatesForRole } from "../modules/user/user.utils";

// ----------------------------------- DATE CHECKER ---------------------------------
export const validDateChecker = (date: string, key: 'from_date' | 'to_date') => {
  const regex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!regex.test(date)) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      `${key} is not a valid date. Valid format is YYYY-MM-DD`
    );
  }
  let valid_date = new Date(date);
  if (key === "from_date") {
    valid_date = new Date(`${date}T00:00:00Z`);
  }
  if (key === "to_date") {
    valid_date = new Date(`${date}T23:59:59Z`);
  }
  return valid_date;
};

// ----------------------------------- PERMISSION CHECKER ---------------------------------
export const permissionChecker = (
  role: "ADMIN" | "LOGISTICS" | "CLIENT",
  permissions: string[] | undefined,
  template: "PLATFORM_ADMIN" | "LOGISTICS_STAFF" | "CLIENT_USER" | undefined | null
): string[] => {
  // Cache all valid permissions for performance
  const allValidPermissions = getAllPermissions();
  const validPermissionsSet = new Set<string>(allValidPermissions);

  const allowedTemplate = allowedTemplatesForRole[role];

  const validPermissions: string[] = [];
  const invalidPermissions: string[] = [];

  // Validate custom permissions
  if (permissions && permissions.length > 0) {
    for (const permission of permissions) {
      if (validPermissionsSet.has(permission)) {
        validPermissions.push(permission);
      } else {
        invalidPermissions.push(permission);
      }
    }
  }

  // Throw error if invalid permissions found
  if (invalidPermissions.length > 0) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      `Invalid permissions: ${invalidPermissions.join(", ")}`
    );
  }

  // Add template permissions if specified
  if (template) {
    if (template !== allowedTemplate) {
      throw new CustomizedError(
        httpStatus.BAD_REQUEST,
        `Role '${role}' can only have '${allowedTemplate}' permission template`
      );
    }

    const templatePermissions = PERMISSION_TEMPLATES[template];
    if (!templatePermissions) {
      throw new CustomizedError(
        httpStatus.BAD_REQUEST,
        `Invalid template: ${template}`
      );
    }


    validPermissions.push(...templatePermissions);
  }

  // Add default template permissions if no permissions and allowed template is specified
  if (validPermissions.length === 0 && allowedTemplate) {
    const templatePermissions = PERMISSION_TEMPLATES[allowedTemplate as keyof typeof PERMISSION_TEMPLATES];
    validPermissions.push(...templatePermissions);
  }

  // Remove duplicates and return
  return [...new Set(validPermissions)];
};
