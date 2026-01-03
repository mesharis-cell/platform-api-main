import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import { companies, financialStatusHistory, invoices, orders } from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { getPresignedUrl } from "../../services/s3.service";
import queryValidator from "../../utils/query-validator";
import paginationMaker from "../../utils/pagination-maker";
import { invoiceQueryValidationConfig, invoiceSortableFields } from "./invoice.utils";
import { uuidRegex } from "../../constants/common";
import { ConfirmPaymentPayload, GenerateInvoicePayload } from "./invoice.interfaces";
import { invoiceGenerator } from "../../utils/invoice";
import { sendEmail } from "../../services/email.service";
import { emailTemplates } from "../../utils/email-templates";
import config from "../../config";

// ----------------------------------- GET INVOICE BY ID --------------------------------------
const getInvoiceById = async (
    invoiceId: string,
    user: AuthUser,
    platformId: string
) => {
    // Step 1: Determine if invoiceId is UUID or invoice_id
    const isUUID = invoiceId.match(uuidRegex);

    // Step 2: Fetch invoice with order and company information
    const [result] = await db
        .select({
            invoice: invoices,
            order: {
                id: orders.id,
                order_id: orders.order_id,
                contact_name: orders.contact_name,
                event_start_date: orders.event_start_date,
                event_end_date: orders.event_end_date,
                venue_name: orders.venue_name,
                final_pricing: orders.final_pricing,
                order_status: orders.order_status,
                financial_status: orders.financial_status,
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
                isUUID ? eq(invoices.id, invoiceId) : eq(invoices.invoice_id, invoiceId),
                eq(invoices.platform_id, platformId)
            )
        );

    // Step 3: Check if invoice exists
    if (!result) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    // Step 4: Access control - CLIENT users can only access their company's invoices
    if (user.role === 'CLIENT') {
        if (!user.company_id || !result.company || result.company.id !== user.company_id) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "You don't have access to this invoice"
            );
        }
    }

    // Step 5: Format and return result
    return {
        id: result.invoice.id,
        invoice_id: result.invoice.invoice_id,
        invoice_pdf_url: result.invoice.invoice_pdf_url,
        invoice_paid_at: result.invoice.invoice_paid_at,
        payment_method: result.invoice.payment_method,
        payment_reference: result.invoice.payment_reference,
        order: result.order,
        company: result.company,
        created_at: result.invoice.created_at,
        updated_at: result.invoice.updated_at,
    };
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

// ----------------------------------- CONFIRM PAYMENT ----------------------------------------
const confirmPayment = async (
    orderId: string,
    payload: ConfirmPaymentPayload,
    user: AuthUser,
    platformId: string
) => {
    // Step 1: Determine if orderId is UUID or order_id
    const isUUID = orderId.match(uuidRegex);

    // Step 2: Fetch invoice with order information
    const [result] = await db
        .select({
            invoice: invoices,
            order: {
                id: orders.id,
                order_id: orders.order_id,
                company_id: orders.company_id,
                financial_status: orders.financial_status,
            },
        })
        .from(invoices)
        .innerJoin(orders, eq(invoices.order_id, orders.id))
        .where(
            and(
                isUUID ? eq(invoices.id, orderId) : eq(invoices.invoice_id, orderId),
                eq(invoices.platform_id, platformId)
            )
        );

    // Step 3: Validate invoice exists
    if (!result) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    // Step 4: Access control - CLIENT users cannot confirm payments
    if (user.role === 'CLIENT') {
        throw new CustomizedError(
            httpStatus.FORBIDDEN,
            "Only ADMIN and LOGISTICS users can confirm payments"
        );
    }

    // Step 5: Verify invoice is not already paid
    if (result.invoice.invoice_paid_at) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Payment already confirmed for this invoice"
        );
    }

    // Step 6: Validate payment date
    const paymentDate = new Date(payload.payment_date || new Date().toISOString());
    const now = new Date();

    if (isNaN(paymentDate.getTime())) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid payment date format");
    }

    if (paymentDate > now) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Payment date cannot be in the future"
        );
    }

    // Step 7: Update invoice with payment details
    await db
        .update(invoices)
        .set({
            invoice_paid_at: paymentDate,
            payment_method: payload.payment_method,
            payment_reference: payload.payment_reference,
            updated_at: new Date(),
        })
        .where(eq(invoices.id, result.invoice.id));

    // Step 8: Update order financial status to PAID
    await db
        .update(orders)
        .set({
            financial_status: 'PAID',
            updated_at: new Date(),
        })
        .where(eq(orders.id, result.order.id));

    // Step 9: Log financial status change
    await db.insert(financialStatusHistory).values({
        platform_id: platformId,
        order_id: result.order.id,
        status: 'PAID',
        notes: payload.notes || `Payment confirmed via ${payload.payment_method}`,
        updated_by: user.id,
    });

    // Step 10: Return updated invoice details
    return {
        invoice_id: result.invoice.invoice_id,
        invoice_paid_at: paymentDate.toISOString(),
        payment_method: payload.payment_method,
        payment_reference: payload.payment_reference,
        order_id: result.order.order_id,
    };
};

// ----------------------------------- INVOICE GENERATE ---------------------------------------
const generateInvoice = async (platformId: string, user: AuthUser, payload: GenerateInvoicePayload) => {
    const { order_id, regenerate } = payload;

    console.log("order_id", order_id);
    console.log("platformId", platformId);

    // Step 1: Fetch order with company details
    const order = await db.query.orders.findFirst({
        where: and(
            eq(orders.id, order_id),
            eq(orders.platform_id, platformId)
        ),
        with: {
            company: true,
            items: {
                with: {
                    asset: {
                        columns: {
                            id: true,
                            name: true,
                            refurb_days_estimate: true,
                        },
                    },
                },
            },
        }
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Prepare invoice data
    const venueLocation = order.venue_location as any;
    const invoiceData = {
        id: order.id,
        user_id: user.id,
        platform_id: order.platform_id,
        order_id: order.order_id,
        contact_name: order.contact_name,
        contact_email: order.contact_email,
        contact_phone: order.contact_phone,
        company_name: order.company.name,
        event_start_date: order.event_start_date,
        event_end_date: order.event_end_date,
        venue_name: order.venue_name,
        venue_country: venueLocation.country || 'N/A',
        venue_city: venueLocation.city || 'N/A',
        venue_address: venueLocation.address || 'N/A',
        pricing: {
            logistics_base_price: (order.logistics_pricing as any)?.base_price || 0,
            platform_margin_percent: (order.platform_pricing as any)?.margin_percent || 0,
            platform_margin_amount: (order.platform_pricing as any)?.margin_amount || 0,
            final_total_price: (order.final_pricing as any)?.total_price || 0,
            show_breakdown: false
        },
        items: order.items.map(item => ({
            asset_name: item.asset.name,
            quantity: item.quantity,
            handling_tags: item.handling_tags as any,
            from_collection_name: item.from_collection_name || 'N/A'
        }))
    };

    // Step 3: Generate invoice
    const { invoice_id, invoice_pdf_url } = await invoiceGenerator(invoiceData, regenerate);

    if (invoice_id && invoice_pdf_url) {
        await sendEmail({
            to: order.contact_email,
            subject: '',
            html: emailTemplates.send_invoice_to_client({
                invoice_number: invoice_id,
                order_id: order.order_id,
                company_name: order.company?.name || 'N/A',
                final_total_price: (order.final_pricing as any)?.total_price || 0,
                download_invoice_url: `${config.server_url}/client/v1/invoice/download-pdf/${invoice_id}?pid=${platformId}`,
            }),
        })
    }

    // Step 4: Return invoice
    return {
        invoice_id,
        invoice_pdf_url,
    };
}
export const InvoiceServices = {
    getInvoiceById,
    downloadInvoice,
    getInvoices,
    confirmPayment,
    generateInvoice,
};
