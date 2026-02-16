import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import httpStatus from "http-status";
import { db } from "../../../db";
import {
    companies,
    financialStatusHistory,
    invoices,
    prices,
    orders,
    inboundRequests,
    serviceRequests,
} from "../../../db/schema";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { getPresignedUrl } from "../../services/s3.service";
import queryValidator from "../../utils/query-validator";
import paginationMaker from "../../utils/pagination-maker";
import { invoiceQueryValidationConfig, invoiceSortableFields } from "./invoice.utils";
import { uuidRegex } from "../../constants/common";
import { ConfirmPaymentPayload, GenerateInvoicePayload } from "./invoice.interfaces";
import { invoiceGenerator, serviceRequestInvoiceGenerator } from "../../utils/invoice";
import { sendEmail } from "../../services/email.service";
import { emailTemplates } from "../../utils/email-templates";
import config from "../../config";
import { multipleEmailSender } from "../../utils/email-sender";
import { getPlatformAdminEmails } from "../../utils/helper-query";
import {
    assertOrderCanGenerateInvoice,
    assertRoleCanReadCommercialInvoice,
    assertServiceRequestCanGenerateInvoice,
    projectPricingByRole,
} from "../../utils/commercial-policy";

// ----------------------------------- GET INVOICE BY ID --------------------------------------
const getInvoiceById = async (invoiceId: string, user: AuthUser, platformId: string) => {
    assertRoleCanReadCommercialInvoice(user.role);

    // Step 1: Determine if invoiceId is UUID or invoice_id
    const isUUID = invoiceId.match(uuidRegex);

    // Step 2: Fetch invoice with order/inbound/service-request context
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
                order_status: orders.order_status,
                financial_status: orders.financial_status,
            },
            inbound_request: {
                id: inboundRequests.id,
                inbound_request_id: inboundRequests.inbound_request_id,
                request_status: inboundRequests.request_status,
                financial_status: inboundRequests.financial_status,
                incoming_at: inboundRequests.incoming_at,
            },
            service_request: {
                id: serviceRequests.id,
                service_request_id: serviceRequests.service_request_id,
                request_status: serviceRequests.request_status,
                commercial_status: serviceRequests.commercial_status,
                title: serviceRequests.title,
            },
            company: {
                id: companies.id,
                name: companies.name,
            },
            pricing: {
                warehouse_ops_rate: prices.warehouse_ops_rate,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                transport: prices.transport,
                line_items: prices.line_items,
                margin: prices.margin,
                final_total: prices.final_total,
                calculated_at: prices.calculated_at,
            },
        })
        .from(invoices)
        .leftJoin(orders, eq(invoices.order_id, orders.id))
        .leftJoin(inboundRequests, eq(invoices.inbound_request_id, inboundRequests.id))
        .leftJoin(serviceRequests, eq(invoices.service_request_id, serviceRequests.id))
        .leftJoin(
            companies,
            sql`${companies.id} = COALESCE(${orders.company_id}, ${inboundRequests.company_id}, ${serviceRequests.company_id})`
        )
        .leftJoin(
            prices,
            sql`${prices.id} = COALESCE(${orders.order_pricing_id}, ${inboundRequests.request_pricing_id}, ${serviceRequests.request_pricing_id})`
        )
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
    if (user.role === "CLIENT") {
        if (!user.company_id || !result.company || result.company.id !== user.company_id) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "You don't have access to this invoice"
            );
        }
    }

    // Step 5: Format and return result
    const visiblePricing = projectPricingByRole(result.pricing, user.role);
    return {
        id: result.invoice.id,
        invoice_id: result.invoice.invoice_id,
        type: result.invoice.type,
        invoice_pdf_url: result.invoice.invoice_pdf_url,
        invoice_paid_at: result.invoice.invoice_paid_at,
        payment_method: result.invoice.payment_method,
        payment_reference: result.invoice.payment_reference,
        order: result.order
            ? {
                  ...result.order,
                  order_pricing: visiblePricing,
              }
            : null,
        inbound_request: result.inbound_request
            ? {
                  ...result.inbound_request,
                  pricing: visiblePricing,
              }
            : null,
        service_request: result.service_request
            ? {
                  ...result.service_request,
                  pricing: visiblePricing,
              }
            : null,
        company: result.company,
        created_at: result.invoice.created_at,
        updated_at: result.invoice.updated_at,
    };
};

// ----------------------------------- DOWNLOAD INVOICE ---------------------------------------
export const downloadInvoice = async (invoiceId: string, user: AuthUser, platformId: string) => {
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
const getInvoices = async (query: Record<string, any>, user: AuthUser, platformId: string) => {
    assertRoleCanReadCommercialInvoice(user.role);

    const {
        search_term,
        page,
        limit,
        sort_by,
        sort_order,
        order_id,
        inbound_request_id,
        service_request_id,
        invoice_id,
        paid_status,
        company_id,
        type,
    } = query;

    // Step 1: Validate query parameters
    if (sort_by) queryValidator(invoiceQueryValidationConfig, "sort_by", sort_by);
    if (sort_order) queryValidator(invoiceQueryValidationConfig, "sort_order", sort_order);
    if (paid_status) queryValidator(invoiceQueryValidationConfig, "paid_status", paid_status);
    if (company_id) queryValidator(invoiceQueryValidationConfig, "company_id", company_id);

    // Step 2: Setup pagination
    const { pageNumber, limitNumber, skip, sortWith, sortSequence } = paginationMaker({
        page,
        limit,
        sort_by,
        sort_order,
    });

    // Step 2: Build WHERE conditions
    const conditions: any[] = [eq(invoices.platform_id, platformId)];

    // Step 2a: Access control - CLIENT users can only see their company's invoices
    // Logic updated: Check if company_id matches either the order's company or the inbound request's company
    if (user.role === "CLIENT") {
        if (!user.company_id) {
            throw new CustomizedError(httpStatus.BAD_REQUEST, "Company ID is required");
        }
    }

    // Step 2b: Optional filters
    if (invoice_id) {
        conditions.push(eq(invoices.invoice_id, invoice_id));
    }

    if (paid_status === "paid") {
        conditions.push(sql`${invoices.invoice_paid_at} IS NOT NULL`);
    } else if (paid_status === "unpaid") {
        conditions.push(sql`${invoices.invoice_paid_at} IS NULL`);
    }

    if (search_term) {
        conditions.push(ilike(invoices.invoice_id, `%${search_term.trim()}%`));
    }

    if (type) {
        queryValidator(invoiceQueryValidationConfig, "type", type);
        conditions.push(eq(invoices.type, type));
    }

    // Step 3: Build context conditions for joins
    const contextConditions: any[] = [];

    if (user.role === "CLIENT" && user.company_id) {
        contextConditions.push(
            sql`COALESCE(${orders.company_id}, ${inboundRequests.company_id}, ${serviceRequests.company_id}) = ${user.company_id}`
        );
    }

    if (order_id) {
        contextConditions.push(eq(orders.order_id, order_id));
    }

    if (inbound_request_id) {
        contextConditions.push(eq(inboundRequests.inbound_request_id, inbound_request_id));
    }

    if (service_request_id) {
        contextConditions.push(eq(serviceRequests.service_request_id, service_request_id));
    }

    if (company_id && user.role !== "CLIENT") {
        contextConditions.push(
            sql`COALESCE(${orders.company_id}, ${inboundRequests.company_id}, ${serviceRequests.company_id}) = ${company_id}`
        );
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
                order_status: orders.order_status,
                financial_status: orders.financial_status,
            },
            inbound_request: {
                id: inboundRequests.id,
                inbound_request_id: inboundRequests.inbound_request_id,
                request_status: inboundRequests.request_status,
                financial_status: inboundRequests.financial_status,
                incoming_at: inboundRequests.incoming_at,
            },
            service_request: {
                id: serviceRequests.id,
                service_request_id: serviceRequests.service_request_id,
                request_status: serviceRequests.request_status,
                commercial_status: serviceRequests.commercial_status,
                title: serviceRequests.title,
            },
            company: {
                id: companies.id,
                name: companies.name,
            },
            pricing: {
                warehouse_ops_rate: prices.warehouse_ops_rate,
                base_ops_total: prices.base_ops_total,
                logistics_sub_total: prices.logistics_sub_total,
                transport: prices.transport,
                line_items: prices.line_items,
                margin: prices.margin,
                final_total: prices.final_total,
                calculated_at: prices.calculated_at,
            },
        })
        .from(invoices)
        .leftJoin(orders, eq(invoices.order_id, orders.id))
        .leftJoin(inboundRequests, eq(invoices.inbound_request_id, inboundRequests.id))
        .leftJoin(serviceRequests, eq(invoices.service_request_id, serviceRequests.id))
        .leftJoin(
            companies,
            sql`${companies.id} = COALESCE(${orders.company_id}, ${inboundRequests.company_id}, ${serviceRequests.company_id})`
        )
        .leftJoin(
            prices,
            sql`${prices.id} = COALESCE(${orders.order_pricing_id}, ${inboundRequests.request_pricing_id}, ${serviceRequests.request_pricing_id})`
        )
        .where(
            and(...conditions, ...(contextConditions.length > 0 ? [and(...contextConditions)] : []))
        )
        .orderBy(orderDirection)
        .limit(limitNumber)
        .offset(skip);

    // Step 6: Get total count
    const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(invoices)
        .leftJoin(orders, eq(invoices.order_id, orders.id))
        .leftJoin(inboundRequests, eq(invoices.inbound_request_id, inboundRequests.id))
        .leftJoin(serviceRequests, eq(invoices.service_request_id, serviceRequests.id))
        .where(
            and(...conditions, ...(contextConditions.length > 0 ? [and(...contextConditions)] : []))
        );

    // Step 7: Format results
    const formattedResults = results.map((item) => {
        const { invoice, order, inbound_request, company, pricing } = item;
        const visiblePricing = projectPricingByRole(pricing, user.role);
        return {
            id: invoice.id,
            invoice_id: invoice.invoice_id,
            invoice_pdf_url: invoice.invoice_pdf_url,
            invoice_paid_at: invoice.invoice_paid_at,
            payment_method: invoice.payment_method,
            payment_reference: invoice.payment_reference,
            order: order
                ? {
                      id: order.id,
                      order_id: order.order_id,
                      contact_name: order.contact_name,
                      event_start_date: order.event_start_date,
                      venue_name: order.venue_name,
                      pricing: visiblePricing,
                      order_status: order.order_status,
                      financial_status: order.financial_status,
                  }
                : null,
            inbound_request: inbound_request
                ? {
                      id: inbound_request.id,
                      inbound_request_id: inbound_request.inbound_request_id,
                      request_status: inbound_request.request_status,
                      financial_status: inbound_request.financial_status,
                      incoming_at: inbound_request.incoming_at,
                      pricing: visiblePricing,
                  }
                : null,
            service_request: item.service_request
                ? {
                      id: item.service_request.id,
                      service_request_id: item.service_request.service_request_id,
                      request_status: item.service_request.request_status,
                      commercial_status: item.service_request.commercial_status,
                      title: item.service_request.title,
                      pricing: visiblePricing,
                  }
                : null,
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
        .where(and(eq(invoices.order_id, orderId), eq(invoices.platform_id, platformId)));

    // Step 3: Validate invoice exists
    if (!result) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Invoice not found");
    }

    // Step 4: Verify invoice is not already paid
    if (result.invoice.invoice_paid_at) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "Payment already confirmed for this invoice"
        );
    }

    // Step 5: Validate payment date
    const paymentDate = new Date(payload.payment_date || new Date().toISOString());
    const now = new Date();

    if (isNaN(paymentDate.getTime())) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Invalid payment date format");
    }

    if (paymentDate > now) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Payment date cannot be in the future");
    }

    await db.transaction(async (tx) => {
        // Step 6: Update invoice with payment details
        await tx
            .update(invoices)
            .set({
                invoice_paid_at: paymentDate,
                payment_method: payload.payment_method,
                payment_reference: payload.payment_reference,
                updated_at: new Date(),
            })
            .where(eq(invoices.id, result.invoice.id));

        // Step 7: Update order financial status to PAID
        await tx
            .update(orders)
            .set({
                financial_status: "PAID",
                updated_at: new Date(),
            })
            .where(eq(orders.id, result.order.id));

        // Step 8: Log financial status change
        await tx.insert(financialStatusHistory).values({
            platform_id: platformId,
            order_id: result.order.id,
            status: "PAID",
            notes: payload.notes || `Payment confirmed via ${payload.payment_method}`,
            updated_by: user.id,
        });
    });

    // Step 9: Return updated invoice details
    return {
        invoice_id: result.invoice.invoice_id,
        invoice_paid_at: paymentDate.toISOString(),
        invoice_pdf_url: result.invoice.invoice_pdf_url,
        payment_method: payload.payment_method,
        payment_reference: payload.payment_reference,
        order_id: result.order.order_id,
    };
};

// ----------------------------------- INVOICE GENERATE ---------------------------------------
const generateInvoice = async (
    platformId: string,
    user: AuthUser,
    payload: GenerateInvoicePayload
) => {
    const { order_id, service_request_id, regenerate } = payload;

    if (service_request_id) {
        const serviceRequest = await db.query.serviceRequests.findFirst({
            where: and(
                eq(serviceRequests.id, service_request_id),
                eq(serviceRequests.platform_id, platformId)
            ),
            with: {
                company: true,
                request_pricing: true,
            },
        });

        if (!serviceRequest) {
            throw new CustomizedError(httpStatus.NOT_FOUND, "Service request not found");
        }
        assertServiceRequestCanGenerateInvoice(
            serviceRequest.billing_mode,
            serviceRequest.commercial_status,
            serviceRequest.request_status,
            regenerate || false
        );

        const company = serviceRequest.company as typeof companies.$inferSelect | null;
        const pricing = serviceRequest.request_pricing;
        const { invoice_id, invoice_pdf_url, pdf_buffer } = await serviceRequestInvoiceGenerator(
            service_request_id,
            platformId,
            regenerate || false,
            user
        );

        if (serviceRequest.commercial_status !== "INVOICED") {
            await db
                .update(serviceRequests)
                .set({
                    commercial_status: "INVOICED",
                    updated_at: new Date(),
                })
                .where(eq(serviceRequests.id, service_request_id));
        }

        if (invoice_id && invoice_pdf_url && company?.contact_email) {
            await sendEmail({
                to: company.contact_email,
                subject: `Invoice ${invoice_id} for Service Request ${serviceRequest.service_request_id}`,
                html: emailTemplates.send_invoice_to_client({
                    invoice_number: invoice_id,
                    order_id: serviceRequest.service_request_id,
                    company_name: company.name || "N/A",
                    final_total_price: String(pricing?.final_total || "0"),
                    download_invoice_url: `${config.server_url}/client/v1/invoice/download-pdf/${invoice_id}?pid=${platformId}`,
                }),
                attachments: pdf_buffer
                    ? [
                          {
                              filename: `${invoice_id}.pdf`,
                              content: pdf_buffer,
                          },
                      ]
                    : undefined,
            });
        }

        const platformAdminEmails = await getPlatformAdminEmails(platformId);
        await multipleEmailSender(
            platformAdminEmails,
            `Invoice Sent: ${invoice_id} for Service Request ${serviceRequest.service_request_id}`,
            emailTemplates.send_invoice_to_admin({
                invoice_number: invoice_id,
                order_id: serviceRequest.service_request_id,
                company_name: company?.name || "N/A",
                final_total_price: String(pricing?.final_total || "0"),
                download_invoice_url: `${config.server_url}/client/v1/invoice/download-pdf/${invoice_id}?pid=${platformId}`,
            })
        );

        return {
            invoice_id,
            invoice_pdf_url,
        };
    }

    if (!order_id) {
        throw new CustomizedError(
            httpStatus.BAD_REQUEST,
            "order_id is required for order invoices"
        );
    }

    // Step 1: Fetch order with company details
    const order = await db.query.orders.findFirst({
        where: and(eq(orders.id, order_id), eq(orders.platform_id, platformId)),
        with: {
            company: true,
            order_pricing: true,
            venue_city: true,
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
        },
    });

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found");
    }

    // Step 2: Validate order can be invoiced
    assertOrderCanGenerateInvoice(order.order_status);

    if (order.financial_status === "INVOICED" && !regenerate) {
        throw new CustomizedError(httpStatus.BAD_REQUEST, "Order is already invoiced");
    }

    // Step 3: Prepare invoice data using new pricing structure
    const company = order.company as typeof companies.$inferSelect | null;
    const pricing = order.order_pricing;

    // Step 4: Update order financial status to INVOICED
    await db
        .update(orders)
        .set({
            financial_status: "INVOICED",
            updated_at: new Date(),
        })
        .where(eq(orders.id, order.id));

    // Step 5: Log financial status change
    await db.insert(financialStatusHistory).values({
        platform_id: platformId,
        order_id: order.id,
        status: "INVOICED",
        notes: regenerate ? "Invoice regenerated" : "Invoice generated",
        updated_by: user.id,
    });

    // Step 6: Generate invoice //
    const { invoice_id, invoice_pdf_url, pdf_buffer } = await invoiceGenerator(
        order.id,
        platformId,
        regenerate,
        user
    );

    if (invoice_id && invoice_pdf_url) {
        await sendEmail({
            to: order.contact_email,
            subject: `Invoice ${invoice_id} for Order ${order.order_id}`,
            html: emailTemplates.send_invoice_to_client({
                invoice_number: invoice_id,
                order_id: order.order_id,
                company_name: company?.name || "N/A",
                final_total_price: String(pricing?.final_total),
                download_invoice_url: `${config.server_url}/client/v1/invoice/download-pdf/${invoice_id}?pid=${platformId}`,
            }),
            attachments: pdf_buffer
                ? [
                      {
                          filename: `${invoice_id}.pdf`,
                          content: pdf_buffer,
                      },
                  ]
                : undefined,
        });

        // Send email to plaform admin
        const platformAdminEmails = await getPlatformAdminEmails(platformId);

        await multipleEmailSender(
            platformAdminEmails,
            `Invoice Sent: ${invoice_id} for Order ${order.order_id}`,
            emailTemplates.send_invoice_to_admin({
                invoice_number: invoice_id,
                order_id: order.order_id,
                company_name: company?.name || "N/A",
                final_total_price: String(pricing?.final_total),
                download_invoice_url: `${config.server_url}/client/v1/invoice/download-pdf/${invoice_id}?pid=${platformId}`,
            })
        );
    }

    // Step 4: Return invoice
    return {
        invoice_id,
        invoice_pdf_url,
    };
};

export const InvoiceServices = {
    getInvoiceById,
    downloadInvoice,
    getInvoices,
    confirmPayment,
    generateInvoice,
};
