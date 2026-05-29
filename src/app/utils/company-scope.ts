import httpStatus from "http-status";
import CustomizedError from "../error/customized-error";
import { AuthUser } from "../interface/common";

/**
 * Company Back Office scoping — the SINGLE choke point.
 *
 * The Company Back Office lets a CLIENT user holding `company:*` permissions
 * act across their whole company (all orders / self-pickups), not just the
 * rows they created. Two-layer enforcement:
 *   1. `requirePermission("company:...")` proves WHAT the user may do.
 *   2. These helpers prove WHOSE data — the cross-tenant row backstop.
 *
 * Scope is ALWAYS derived from `user.company_id` here, never from a request
 * param — that is the whole reason this is centralized. When/if multi-company
 * memberships land, only these two functions become membership-aware; every
 * call site stays unchanged. See CLAUDE.md + the company-back-office plan.
 */

/** The company a back-office request is scoped to. Throws if the account has none. */
export const resolveCompanyScope = (user: AuthUser): string => {
    if (!user.company_id) {
        throw new CustomizedError(httpStatus.FORBIDDEN, "This account is not scoped to a company");
    }
    return user.company_id;
};

/**
 * Cross-tenant row backstop for by-id reads/mutations in the company back
 * office. The capability is already proven by `requirePermission` in the route
 * chain; this only confirms the entity belongs to the caller's company.
 */
export const assertCompanyScopeOrManager = (
    user: AuthUser,
    entity: { company_id: string | null | undefined },
    entityLabel = "record"
): void => {
    if (!user.company_id || !entity.company_id || user.company_id !== entity.company_id) {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            `You do not have access to this ${entityLabel}`
        );
    }
};
