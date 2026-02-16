import httpStatus from "http-status";
import { serviceRequestBillingModeEnum } from "../../db/schema";
import { AuthUser } from "../interface/common";
import CustomizedError from "../error/customized-error";

type UserRole = AuthUser["role"];
type ServiceRequestBillingMode = (typeof serviceRequestBillingModeEnum.enumValues)[number];

type ServiceRequestStatus =
    | "DRAFT"
    | "SUBMITTED"
    | "IN_REVIEW"
    | "APPROVED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELLED";

type ServiceRequestCommercialStatus =
    | "INTERNAL"
    | "PENDING_QUOTE"
    | "QUOTED"
    | "QUOTE_APPROVED"
    | "INVOICED"
    | "PAID"
    | "CANCELLED";

const ORDER_INVOICE_ALLOWED_STATUSES = new Set([
    "CONFIRMED",
    "AWAITING_FABRICATION",
    "IN_PREPARATION",
    "READY_FOR_DELIVERY",
    "IN_TRANSIT",
    "DELIVERED",
    "IN_USE",
    "AWAITING_RETURN",
    "RETURN_IN_TRANSIT",
    "CLOSED",
]);

const SERVICE_REQUEST_STATUS_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
    DRAFT: ["SUBMITTED", "CANCELLED"],
    SUBMITTED: ["IN_REVIEW", "CANCELLED"],
    IN_REVIEW: ["APPROVED", "CANCELLED"],
    APPROVED: ["IN_PROGRESS", "CANCELLED"],
    IN_PROGRESS: ["COMPLETED", "CANCELLED"],
    COMPLETED: [],
    CANCELLED: [],
};

const BILLABLE_COMMERCIAL_TRANSITIONS: Record<
    ServiceRequestCommercialStatus,
    ServiceRequestCommercialStatus[]
> = {
    INTERNAL: [],
    PENDING_QUOTE: ["QUOTED", "CANCELLED"],
    QUOTED: ["PENDING_QUOTE", "QUOTE_APPROVED", "CANCELLED"],
    QUOTE_APPROVED: ["INVOICED", "CANCELLED"],
    INVOICED: ["PAID", "CANCELLED"],
    PAID: [],
    CANCELLED: [],
};

const INTERNAL_COMMERCIAL_TRANSITIONS: Record<
    ServiceRequestCommercialStatus,
    ServiceRequestCommercialStatus[]
> = {
    INTERNAL: ["INVOICED", "PAID", "CANCELLED"],
    PENDING_QUOTE: [],
    QUOTED: [],
    QUOTE_APPROVED: [],
    INVOICED: ["PAID", "CANCELLED"],
    PAID: [],
    CANCELLED: [],
};

const assertTransition = (
    current: string,
    target: string,
    transitions: Record<string, string[]>,
    errorLabel: string
) => {
    if (current === target) return;
    const allowed = transitions[current] || [];
    if (allowed.includes(target)) return;
    throw new CustomizedError(
        httpStatus.BAD_REQUEST,
        `Invalid ${errorLabel} transition: ${current} -> ${target}`
    );
};

export const assertRoleCanReadCommercialInvoice = (role: UserRole) => {
    if (role !== "LOGISTICS") return;
    throw new CustomizedError(
        httpStatus.FORBIDDEN,
        "Invoice and sell-side commercial documents are not available for logistics users"
    );
};

export const isSellSideVisibleToRole = (role: UserRole) => role !== "LOGISTICS";

export const getCommercialDocumentAudienceForRole = (role: UserRole) =>
    isSellSideVisibleToRole(role) ? "SELL_SIDE" : "BUY_SIDE";

export const projectPricingByRole = <
    T extends {
        margin?: unknown;
        final_total?: unknown;
        [key: string]: unknown;
    } | null,
>(
    pricing: T,
    role: UserRole
): T => {
    if (!pricing || role !== "LOGISTICS") return pricing;
    const { margin: _margin, final_total: _finalTotal, ...rest } = pricing;
    return rest as T;
};

export const assertOrderCanGenerateInvoice = (orderStatus: string) => {
    if (ORDER_INVOICE_ALLOWED_STATUSES.has(orderStatus)) return;
    throw new CustomizedError(
        httpStatus.BAD_REQUEST,
        `Cannot generate invoice for order in ${orderStatus} status`
    );
};

export const assertServiceRequestStatusTransition = (
    current: ServiceRequestStatus,
    target: ServiceRequestStatus
) => {
    assertTransition(current, target, SERVICE_REQUEST_STATUS_TRANSITIONS, "service request status");
};

export const assertServiceRequestCommercialTransition = (
    current: ServiceRequestCommercialStatus,
    target: ServiceRequestCommercialStatus,
    billingMode: ServiceRequestBillingMode
) => {
    const transitions =
        billingMode === "CLIENT_BILLABLE"
            ? BILLABLE_COMMERCIAL_TRANSITIONS
            : INTERNAL_COMMERCIAL_TRANSITIONS;

    if (billingMode === "CLIENT_BILLABLE" && target === "INTERNAL") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Client-billable service requests cannot use INTERNAL commercial status"
        );
    }

    if (
        billingMode === "INTERNAL_ONLY" &&
        ["PENDING_QUOTE", "QUOTED", "QUOTE_APPROVED"].includes(target)
    ) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Internal-only service requests cannot use quote lifecycle statuses"
        );
    }

    assertTransition(current, target, transitions, "service request commercial status");
};

export const assertClientCanApproveServiceRequestQuote = (
    billingMode: ServiceRequestBillingMode,
    commercialStatus: ServiceRequestCommercialStatus
) => {
    if (billingMode !== "CLIENT_BILLABLE") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Only client-billable service requests have an approval flow"
        );
    }

    if (commercialStatus !== "QUOTED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Quote can only be approved from QUOTED status. Current: ${commercialStatus}`
        );
    }
};

export const assertServiceRequestCanGenerateInvoice = (
    billingMode: ServiceRequestBillingMode,
    commercialStatus: ServiceRequestCommercialStatus,
    requestStatus: ServiceRequestStatus,
    regenerate: boolean
) => {
    if (requestStatus === "CANCELLED") {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Cannot generate invoice for cancelled service request"
        );
    }

    if (billingMode === "CLIENT_BILLABLE") {
        if (!regenerate && commercialStatus !== "QUOTE_APPROVED") {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                "Billable service request must be quote-approved before invoicing"
            );
        }

        if (regenerate && !["QUOTE_APPROVED", "INVOICED", "PAID"].includes(commercialStatus)) {
            throw new CustomizedError(
                httpStatus.BAD_REQUEST,
                `Cannot regenerate invoice from commercial status ${commercialStatus}`
            );
        }
        return;
    }

    if (!["INTERNAL", "INVOICED", "PAID"].includes(commercialStatus)) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            `Internal-only service requests cannot be invoiced from status ${commercialStatus}`
        );
    }
};
