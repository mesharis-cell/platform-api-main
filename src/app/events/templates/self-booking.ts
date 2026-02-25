import { EmailTemplate } from "./index";
import { actionButton, footer, infoBox, infoRow, wrap } from "./base";

const p = (payload: Record<string, unknown>) => payload as Record<string, any>;

export const selfBookingCreatedAdmin: EmailTemplate = {
    subject: (payload) => `Self-Booking Created: ${p(payload).entity_id_readable || "N/A"}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #1f2937;">Self-Booking Created</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A new self-booking was created and is now active.</p>
            ${infoBox(`
                ${infoRow("Booked For", d.booked_for || "N/A")}
                ${infoRow("Reference", d.job_reference || "N/A")}
                ${infoRow("Created By", d.created_by_name || "N/A")}
                ${infoRow("Items", `${d.item_count || 0}`)}
                ${infoRow("Total Units", `${d.total_units || 0}`)}
            `)}
            ${d.self_booking_url ? actionButton("View Self-Booking", d.self_booking_url) : ""}
            ${footer()}
        `);
    },
};

export const selfBookingCompletedAdmin: EmailTemplate = {
    subject: (payload) => `Self-Booking Completed: ${p(payload).entity_id_readable || "N/A"}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #059669;">Self-Booking Completed</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">All self-booked items have been returned.</p>
            ${infoBox(`
                ${infoRow("Booked For", d.booked_for || "N/A")}
                ${infoRow("Reference", d.job_reference || "N/A")}
                ${infoRow("Items", `${d.item_count || 0}`)}
                ${infoRow("Total Units", `${d.total_units || 0}`)}
            `)}
            ${d.self_booking_url ? actionButton("View Self-Booking", d.self_booking_url, "#059669") : ""}
            ${footer()}
        `);
    },
};

export const selfBookingCancelledAdmin: EmailTemplate = {
    subject: (payload) => `Self-Booking Cancelled: ${p(payload).entity_id_readable || "N/A"}`,
    html: (payload) => {
        const d = p(payload);
        return wrap(`
            <h1 style="margin: 0 0 24px; font-size: 28px; font-weight: bold; color: #dc2626;">Self-Booking Cancelled</h1>
            <p style="margin: 0 0 16px; font-size: 16px; color: #374151;">A self-booking was cancelled.</p>
            ${infoBox(`
                ${infoRow("Booked For", d.booked_for || "N/A")}
                ${infoRow("Reference", d.job_reference || "N/A")}
                ${infoRow("Cancelled By", d.cancelled_by_name || "N/A")}
                ${infoRow("Reason", d.cancellation_reason || "N/A")}
            `)}
            ${d.self_booking_url ? actionButton("View Self-Booking", d.self_booking_url, "#dc2626") : ""}
            ${footer()}
        `);
    },
};
