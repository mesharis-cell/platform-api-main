import { financialStatusEnum, inboundRequests, inboundRequestStatusEnum } from "../../../db/schema";

export const inboundRequestSortableFields: Record<string, any> = {
    incoming_at: inboundRequests.incoming_at,
    created_at: inboundRequests.created_at,
    request_status: inboundRequests.request_status,
    financial_status: inboundRequests.financial_status,
};

export const inboundRequestQueryValidationConfig = {
    sort_by: Object.keys(inboundRequestSortableFields),
    sort_order: ["asc", "desc"],
    request_status: inboundRequestStatusEnum.enumValues,
    financial_status: financialStatusEnum.enumValues,
};
