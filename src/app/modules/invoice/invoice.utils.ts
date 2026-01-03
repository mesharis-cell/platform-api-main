import { invoices } from "../../../db/schema";
import { sortOrderType } from "../../constants/common";

export const invoiceSortableFields: Record<string, any> = {
    invoice_id: invoices.invoice_id,
    created_at: invoices.created_at,
    updated_at: invoices.updated_at,
};

export const invoiceQueryValidationConfig = {
    sort_by: Object.keys(invoiceSortableFields),
    sort_order: sortOrderType,
    paid_status: ['paid', 'unpaid'],
    company_id: 'uuid'
};