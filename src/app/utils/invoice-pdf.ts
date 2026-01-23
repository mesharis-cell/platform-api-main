import PDFDocument from "pdfkit";
import { InvoicePayload } from "./invoice";
import { formatDateForEmail } from "./date-time";

const formatCurrency = (amount: string): string => {
    const num = parseFloat(amount);
    return `AED ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ============================================================
// INVOICE PDF - Same Design as Cost Estimate
// ============================================================
export async function renderInvoicePDF(
    data: InvoicePayload & { invoice_number: string; invoice_date: Date }
): Promise<Buffer> {
    console.log("=== Starting Invoice PDF Generation ===");
    console.log("Invoice Number:", data.invoice_number);

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: "A4", margin: 45 });
            const chunks: Buffer[] = [];

            doc.on("data", (chunk: Buffer) => {
                chunks.push(chunk);
            });

            doc.on("end", () => {
                const buffer = Buffer.concat(chunks);
                console.log("Invoice PDF generated successfully, size:", buffer.length, "bytes");
                resolve(buffer);
            });

            doc.on("error", (error: Error) => {
                console.error("=== Invoice PDF Generation Error ===");
                console.error("Error:", error);
                reject(error);
            });

            const pageWidth = doc.page.width;
            const pageHeight = doc.page.height;
            const margin = 40;
            const contentWidth = pageWidth - margin * 2;

            // ============================================================
            // HEADER - Minimalist Design
            // ============================================================
            // Diagonal corner accent
            doc.moveTo(0, 0).lineTo(60, 0).lineTo(0, 60).fill("#000");

            doc.fontSize(36)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("INVOICE", margin, margin, { align: "left" });

            doc.moveDown(1);

            // Invoice details in grid (2 boxes - same as cost estimate)
            const detailsY = doc.y;
            const detailBoxWidth = (contentWidth - 10) / 2;

            // Date
            const dateBoxX = margin;
            doc.rect(dateBoxX, detailsY, detailBoxWidth, 40).lineWidth(1).stroke("#ccc");

            doc.fontSize(7)
                .font("Helvetica-Bold")
                .fillColor("#666")
                .text("DATE", dateBoxX + 10, detailsY + 8, { width: detailBoxWidth - 20 });

            doc.fontSize(10)
                .font("Helvetica")
                .fillColor("#000")
                .text(formatDateForEmail(data.invoice_date), dateBoxX + 10, detailsY + 20, {
                    width: detailBoxWidth - 20,
                });

            // Order Reference
            const orderBoxX = dateBoxX + detailBoxWidth + 10;
            doc.rect(orderBoxX, detailsY, detailBoxWidth, 40).lineWidth(1).stroke("#ccc");

            doc.fontSize(7)
                .font("Helvetica-Bold")
                .fillColor("#666")
                .text("ORDER REF", orderBoxX + 10, detailsY + 8, { width: detailBoxWidth - 20 });

            doc.fontSize(10)
                .font("Helvetica")
                .fillColor("#000")
                .text(data.order_id, orderBoxX + 10, detailsY + 20, { width: detailBoxWidth - 20 });

            doc.y = detailsY + 60;

            // ============================================================
            // CLIENT & EVENT INFO
            // ============================================================
            const infoY = doc.y;

            // Bill To Section
            doc.fontSize(8).font("Helvetica-Bold").fillColor("#000").text("BILL TO", margin, infoY);

            doc.rect(margin, infoY + 12, contentWidth * 0.48, 1).fill("#000");

            doc.fontSize(11)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text(data.company_name, margin, infoY + 20);

            doc.fontSize(9)
                .font("Helvetica")
                .fillColor("#555")
                .text(data.contact_name, margin, doc.y + 3)
                .text(data.contact_email, margin)
                .text(data.contact_phone, margin);

            // Event Details Section
            const eventX = margin + contentWidth * 0.52;

            doc.fontSize(8)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("EVENT DETAILS", eventX, infoY);

            doc.rect(eventX, infoY + 12, contentWidth * 0.48, 1).fill("#000");

            doc.fontSize(9)
                .font("Helvetica")
                .fillColor("#555")
                .text(
                    `${formatDateForEmail(data.event_start_date)} - ${formatDateForEmail(data.event_end_date)}`,
                    eventX,
                    infoY + 20,
                    { width: contentWidth * 0.48 }
                )
                .text(data.venue_name, eventX, doc.y + 3, { width: contentWidth * 0.48 })
                .text(`${data.venue_city}, ${data.venue_country}`, eventX, doc.y + 2, {
                    width: contentWidth * 0.48,
                })
                .text(data.venue_address, eventX, doc.y + 2, { width: contentWidth * 0.48 });

            doc.y = Math.max(doc.y, infoY + 100);
            doc.moveDown(1);

            // ============================================================
            // ITEMS TABLE - Modern Grid
            // ============================================================
            doc.fontSize(8).font("Helvetica-Bold").fillColor("#000").text("ITEMS", margin, doc.y);

            doc.rect(margin, doc.y + 2, 40, 1).fill("#000");

            doc.moveDown(1);

            const tableTop = doc.y;
            const colSNoX = margin;
            const colAssetX = margin + 35;
            const colQtyX = margin + contentWidth * 0.65;
            const colNotesX = margin + contentWidth * 0.77;

            // Table header
            doc.fontSize(8)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("S.No", colSNoX, tableTop, { width: 30, align: "center" })
                .text("ASSET NAME", colAssetX, tableTop)
                .text("QTY", colQtyX, tableTop, { width: contentWidth * 0.1, align: "center" })
                .text("NOTES", colNotesX, tableTop);

            // Header line
            doc.moveTo(margin, tableTop + 12)
                .lineTo(pageWidth - margin, tableTop + 12)
                .lineWidth(1.5)
                .stroke("#000");

            let currentY = tableTop + 20;

            // Table rows
            data.items.forEach((item, index) => {
                const rowY = currentY;

                // Serial number as plain text
                doc.fontSize(9)
                    .font("Helvetica-Bold")
                    .fillColor("#000")
                    .text(String(index + 1), colSNoX, rowY, { width: 30, align: "center" });

                // Asset name
                doc.fontSize(10)
                    .font("Helvetica")
                    .fillColor("#000")
                    .text(item.asset_name, colAssetX, rowY, {
                        width: contentWidth * 0.55,
                        continued: false,
                    });

                // Quantity
                doc.fontSize(10)
                    .font("Helvetica-Bold")
                    .fillColor("#000")
                    .text(String(item.quantity), colQtyX, rowY, {
                        width: contentWidth * 0.1,
                        align: "center",
                        continued: false,
                    });

                // Notes
                let notesY = rowY;
                if (item.from_collection_name) {
                    doc.fontSize(7)
                        .font("Helvetica")
                        .fillColor("#666")
                        .text(`From: ${item.from_collection_name}`, colNotesX, notesY, {
                            width: contentWidth * 0.23,
                            continued: false,
                        });
                    notesY = doc.y;
                }

                if (item.handling_tags && item.handling_tags.length > 0) {
                    const tagsText = item.handling_tags.join(", ");
                    doc.fontSize(7)
                        .font("Helvetica")
                        .fillColor("#999")
                        .text(tagsText, colNotesX, notesY, {
                            width: contentWidth * 0.23,
                            continued: false,
                        });
                }

                currentY = doc.y + 15;

                // Dotted separator
                if (index < data.items.length - 1) {
                    doc.moveTo(margin, currentY - 7)
                        .lineTo(pageWidth - margin, currentY - 7)
                        .dash(3, { space: 3 })
                        .lineWidth(0.5)
                        .stroke("#ddd")
                        .undash();
                }
            });

            // Bottom line
            doc.moveTo(margin, currentY)
                .lineTo(pageWidth - margin, currentY)
                .lineWidth(1.5)
                .stroke("#000");

            doc.y = currentY + 20;

            // ============================================================
            // PRICING SUMMARY
            // ============================================================
            const summaryX = pageWidth - margin - 260;
            const summaryWidth = 260;

            if (data.pricing.show_breakdown) {
                doc.fontSize(10)
                    .font("Helvetica")
                    .fillColor("#555")
                    .text("Logistics Base Cost", summaryX, doc.y);

                doc.fontSize(10)
                    .font("Helvetica")
                    .fillColor("#000")
                    .text(formatCurrency(data.pricing.logistics_base_price), summaryX, doc.y - 12, {
                        align: "right",
                        width: summaryWidth,
                    });

                doc.moveDown(0.6);

                doc.fontSize(10)
                    .font("Helvetica")
                    .fillColor("#555")
                    .text(
                        `Service Fee (${data.pricing.platform_margin_percent}%)`,
                        summaryX,
                        doc.y
                    );

                doc.fontSize(10)
                    .font("Helvetica")
                    .fillColor("#000")
                    .text(
                        formatCurrency(data.pricing.platform_margin_amount),
                        summaryX,
                        doc.y - 12,
                        { align: "right", width: summaryWidth }
                    );

                doc.moveDown(0.8);

                // Dashed separator
                doc.moveTo(summaryX, doc.y)
                    .lineTo(summaryX + summaryWidth, doc.y)
                    .dash(4, { space: 4 })
                    .lineWidth(1)
                    .stroke("#999")
                    .undash();

                doc.moveDown(0.5);
            }

            // Total with diagonal stripes background
            const totalY = doc.y;
            const totalHeight = 45;

            // Background box
            doc.rect(summaryX, totalY, summaryWidth, totalHeight).lineWidth(2).stroke("#000");

            // Diagonal pattern
            for (let i = 0; i < 20; i++) {
                doc.moveTo(summaryX + i * 20, totalY + totalHeight)
                    .lineTo(summaryX + i * 20 + totalHeight, totalY)
                    .lineWidth(0.3)
                    .stroke("#f0f0f0");
            }

            doc.fontSize(10)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("TOTAL AMOUNT", summaryX + 15, totalY + 12);

            doc.fontSize(18)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text(formatCurrency(data.pricing.final_total_price), summaryX + 15, totalY + 12, {
                    align: "right",
                    width: summaryWidth - 30,
                });

            doc.y = totalY + totalHeight + 25;

            // ============================================================
            // IMPORTANT NOTES
            // ============================================================
            doc.fontSize(8)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("IMPORTANT NOTES", margin, doc.y);

            doc.rect(margin, doc.y + 2, 100, 1).fill("#000");

            doc.moveDown(1);

            const notes = [
                "Payment Method: Bank Transfer or Check",
                "Payment Terms: Net 30 Days",
                `Invoice Reference: ${data.invoice_number}`,
            ];

            notes.forEach((note) => {
                // Bullet point
                doc.circle(margin + 3, doc.y + 3, 2).fill("#000");

                doc.fontSize(8)
                    .font("Helvetica")
                    .fillColor("#333")
                    .text(note, margin + 12, doc.y, { width: contentWidth - 12 });

                doc.moveDown(0.3);
            });

            doc.moveDown(0.3);

            doc.fontSize(7)
                .font("Helvetica")
                .fillColor("#666")
                .text(
                    "Please include the invoice number in your payment reference to ensure proper processing.",
                    margin,
                    doc.y,
                    { width: contentWidth }
                );

            // ============================================================
            // FOOTER
            // ============================================================
            const footerY = pageHeight - 65;

            doc.moveTo(margin, footerY)
                .lineTo(pageWidth - margin, footerY)
                .lineWidth(0.5)
                .stroke("#ccc");

            doc.fontSize(7)
                .font("Helvetica")
                .fillColor("#999")
                .text("Thank you for your business", margin, footerY + 10, {
                    align: "center",
                    width: contentWidth,
                });

            // Corner accent bottom right
            doc.moveTo(pageWidth, pageHeight)
                .lineTo(pageWidth - 60, pageHeight)
                .lineTo(pageWidth, pageHeight - 60)
                .fill("#000");

            doc.end();
        } catch (error) {
            console.error("=== Invoice PDF Generation Failed ===");
            console.error("Error:", error);
            if (error instanceof Error) {
                console.error("Stack:", error.stack);
            }
            reject(error);
        }
    });
}
