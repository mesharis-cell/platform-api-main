import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, invoices, orders } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { getPresignedUrl } from "../../services/s3.service";
import queryValidator from "../../utils/query-validator";
import paginationMaker from "../../utils/pagination-maker";
import { invoiceQueryValidationConfig, invoiceSortableFields } from "./invoice.utils";

// ----------------------------------- GET INVOICE BY ID --------------------------------------
export const getInvoiceById = async (
    invoiceId: string,
    user: AuthUser,
    platformId: string
) => {
    // Fetch invoice
    const [invoice] = await db
        .select()
        .from(invoices)
        .where(
            and(
                eq(invoices.invoice_id, invoiceId),
                eq(invoices.platform_id, platformId)
            )
        );

    if (!invoice) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    // Access control: Only ADMIN, LOGISTICS, or the company that owns the order can access
    if (user.role === 'CLIENT') {
        // Need to check if the invoice's order belongs to the user's company
        const [order] = await db
            .select()
            .from(orders)
            .where(eq(orders.id, invoice.order_id));

        if (!order || order.company_id !== user.company_id) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "You don't have access to this invoice"
            );
        }
    }

    return invoice;
};

// ----------------------------------- DOWNLOAD INVOICE ---------------------------------------
export const downloadInvoice = async (
    invoiceId: string,
    user: AuthUser,
    platformId: string
) => {
    // Get invoice with access control
    const invoice = await getInvoiceById(invoiceId, user, platformId);

    // Generate presigned URL for download (valid for 1 hour)
    const downloadUrl = await getPresignedUrl(invoice.invoice_pdf_url, 3600);

    return {
        invoice_id: invoice.invoice_id,
        download_url: downloadUrl,
        expires_in: 3600, // seconds
    };
};

// ----------------------------------- GET INVOICES -------------------------------------------
const getInvoices = async (
    query: Record<string, any>,
    user: AuthUser,
    platformId: string
) => {
    const {
        search_term,
        page,
        limit,
        sort_by,
        sort_order,
        order_id,
        invoice_id,
        paid_status,
        company_id
    } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(invoiceQueryValidationConfig, "sort_by", sort_by);
    if (sort_order)
        queryValidator(invoiceQueryValidationConfig, "sort_order", sort_order);
    if (paid_status)
        queryValidator(invoiceQueryValidationConfig, "paid_status", paid_status);
    if (company_id)
        queryValidator(invoiceQueryValidationConfig, "company_id", company_id);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } =
        paginationMaker({
            page,
            limit,
            sort_by,
            sort_order,
        });

    // Step 2: Build WHERE conditions
    const conditions: any[] = [eq(invoices.platform_id, platformId)];

    // Step 2a: Access control - CLIENT users can only see their company's invoices
    if (user.role === 'CLIENT') {
        if (!user.company_id) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Company ID is required");
        }
    }

    // Step 2b: Optional filters
    if (invoice_id) {
        conditions.push(eq(invoices.invoice_id, invoice_id));
    }

    if (paid_status === 'paid') {
        conditions.push(sql`${invoices.invoice_paid_at} IS NOT NULL`);
    } else if (paid_status === 'unpaid') {
        conditions.push(sql`${invoices.invoice_paid_at} IS NULL`);
    }

    if (search_term) {
        conditions.push(
            ilike(invoices.invoice_id, `%${search_term.trim()}%`),
        );
    }

    // Step 3: Build order conditions for join
    const orderConditions: any[] = [];

    if (user.role === 'CLIENT' && user.company_id) {
        orderConditions.push(eq(orders.company_id, user.company_id));
    }

    if (order_id) {
        orderConditions.push(eq(orders.order_id, order_id));
    }

    if (company_id && user.role !== 'CLIENT') {
        orderConditions.push(eq(orders.company_id, company_id));
    }

    // Step 4: Determine sort order
    const orderByColumn = invoiceSortableFields[sortWith] || invoices.created_at;
    const orderDirection = sortSequence === "asc" ? asc(orderByColumn) : desc(orderByColumn);

    // Step 5: Fetch invoices with order information
    const results = await db
        .select({
            invoice: invoices,
            order: {
                id: orders.id,
                order_id: orders.order_id,
                company_id: orders.company_id,
                contact_name: orders.contact_name,
                event_start_date: orders.event_start_date,
                venue_name: orders.venue_name,
                final_pricing: orders.final_pricing,
            },
            company: {
                id: companies.id,
                name: companies.name,
            },
        })
        .from(invoices)
        .innerJoin(orders, eq(invoices.order_id, orders.id))
        .leftJoin(companies, eq(orders.company_id, companies.id))
        .where(
            and(
                ...conditions,
                ...(orderConditions.length > 0 ? [and(...orderConditions)] : [])
            )
        )
        .orderBy(orderDirection)
        .limit(limitNumber)
        .offset(skip);

    // Step 6: Get total count
    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(invoices)
        .innerJoin(orders, eq(invoices.order_id, orders.id))
        .where(
            and(
                ...conditions,
                ...(orderConditions.length > 0 ? [and(...orderConditions)] : [])
            )
        );

    // Step 7: Format results
    const formattedResults = results.map(item => {
        const { invoice, order, company } = item;
        return {
            id: invoice.id,
            invoice_id: invoice.invoice_id,
            invoice_pdf_url: invoice.invoice_pdf_url,
            invoice_paid_at: invoice.invoice_paid_at,
            payment_method: invoice.payment_method,
            payment_reference: invoice.payment_reference,
            order: {
                id: order.id,
                order_id: order.order_id,
                contact_name: order.contact_name,
                event_start_date: order.event_start_date,
                venue_name: order.venue_name,
                final_pricing: order.final_pricing,
            },
            company: {
                id: company?.id,
                name: company?.name,
            },
            created_at: invoice.created_at,
            updated_at: invoice.updated_at,
        };
    });

    // Step 8: Return results
    return {
        data: formattedResults,
        meta: {
            page: pageNumber,
            limit: limitNumber,
            total: countResult.count,
        },
    };
};

export const InvoiceServices = {
    getInvoiceById,
    downloadInvoice,
    getInvoices,
};
