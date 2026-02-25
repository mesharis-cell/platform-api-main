import PDFDocument from "pdfkit";
import { formatDateForEmail } from "./date-time";
import { InboundRequestInvoicePayload } from "./inbound-request-invoice";

const formatCurrency = (amount: string): string => {
    const num = parseFloat(amount);
    return `AED ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ============================================================
// INBOUND REQUEST INVOICE PDF
// ============================================================
export async function renderInboundRequestInvoicePDF(
    data: InboundRequestInvoicePayload & { invoice_number: string; invoice_date: Date }
): Promise<Buffer> {
    console.log("=== Starting Inbound Request Invoice PDF Generation ===");
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
            // HEADER
            // ============================================================
            // Diagonal corner accent
            doc.moveTo(0, 0).lineTo(60, 0).lineTo(0, 60).fill("#000");

            doc.fontSize(36)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("INVOICE", margin, margin, { align: "left" });

            doc.moveDown(1);

            // Invoice details in grid
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

            const refBoxX = dateBoxX + detailBoxWidth + 10;
            doc.rect(refBoxX, detailsY, detailBoxWidth, 40).lineWidth(1).stroke("#ccc");

            doc.fontSize(7)
                .font("Helvetica-Bold")
                .fillColor("#666")
                .text("REFERENCE", refBoxX + 10, detailsY + 8, { width: detailBoxWidth - 20 });

            doc.fontSize(8) // Smaller font for UUID
                .font("Helvetica")
                .fillColor("#000")
                .text(
                    data.inbound_request_id.slice(0, 8).toUpperCase(),
                    refBoxX + 10,
                    detailsY + 20,
                    { width: detailBoxWidth - 20 }
                ); // Shortened ID

            doc.y = detailsY + 60;

            // ============================================================
            // CLIENT & INFO
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

            // Inbound Details Section
            const eventX = margin + contentWidth * 0.52;

            doc.fontSize(8)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("INBOUND DETAILS", eventX, infoY);

            doc.rect(eventX, infoY + 12, contentWidth * 0.48, 1).fill("#000");

            doc.fontSize(9)
                .font("Helvetica")
                .fillColor("#555")
                .text(
                    `Incoming Date: ${formatDateForEmail(data.incoming_at)}`,
                    eventX,
                    infoY + 20,
                    { width: contentWidth * 0.48 }
                );

            if (data.note) {
                doc.text(`Note: ${data.note}`, eventX, doc.y + 3, { width: contentWidth * 0.48 });
            }

            doc.y = Math.max(doc.y, infoY + 100);
            doc.moveDown(1);

            // ============================================================
            // ITEMS TABLE
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
                .text("ITEM NAME", colAssetX, tableTop)
                .text("QTY", colQtyX, tableTop, { width: contentWidth * 0.1, align: "center" })
                .text("CATEGORY", colNotesX, tableTop);

            // Header line
            doc.moveTo(margin, tableTop + 12)
                .lineTo(pageWidth - margin, tableTop + 12)
                .lineWidth(1.5)
                .stroke("#000");

            let currentY = tableTop + 20;

            // Table rows
            data.items.forEach((item, index) => {
                const rowY = currentY;

                // Serial number
                doc.fontSize(9)
                    .font("Helvetica-Bold")
                    .fillColor("#000")
                    .text(String(index + 1), colSNoX, rowY, { width: 30, align: "center" });

                // Item name
                doc.fontSize(10)
                    .font("Helvetica")
                    .fillColor("#000")
                    .text(item.name, colAssetX, rowY, {
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

                // Category or Tags
                doc.fontSize(9)
                    .font("Helvetica")
                    .fillColor("#666")
                    .text(item.category, colNotesX, rowY, {
                        width: contentWidth * 0.23,
                        continued: false,
                    });

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

            // Logistics Base Cost Row (displayed as "Total" below Items table)
            const logisticsCostY = currentY + 10;
            doc.fontSize(10)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("Total", margin + contentWidth * 0.55, logisticsCostY, {
                    width: contentWidth * 0.25,
                    align: "right",
                });

            doc.fontSize(10)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text(
                    formatCurrency(data.pricing.logistics_sub_total),
                    margin + contentWidth * 0.8,
                    logisticsCostY,
                    {
                        width: contentWidth * 0.15,
                        align: "right",
                    }
                );

            doc.y = logisticsCostY + 30;

            // ============================================================
            // LINE ITEMS TABLE (New - Constructed from totals)
            // ============================================================
            if (data.line_items.length > 0) {
                doc.fontSize(8)
                    .font("Helvetica-Bold")
                    .fillColor("#000")
                    .text("LINE ITEMS", margin, doc.y);

                doc.rect(margin, doc.y + 2, 60, 1).fill("#000");

                doc.moveDown(1);

                const tableTop = doc.y;
                const colSNoX = margin;
                const colDescX = margin + 35;
                const colQtyX = margin + contentWidth * 0.55;
                const colRateX = margin + contentWidth * 0.65;
                const colTotalX = margin + contentWidth * 0.8;

                // Table header
                doc.fontSize(8)
                    .font("Helvetica-Bold")
                    .fillColor("#000")
                    .text("S.No", colSNoX, tableTop, { width: 30, align: "center" })
                    .text("DESCRIPTION", colDescX, tableTop)
                    .text("QTY", colQtyX, tableTop, { width: contentWidth * 0.1, align: "center" })
                    .text("UNIT RATE", colRateX, tableTop, {
                        width: contentWidth * 0.15,
                        align: "right",
                    })
                    .text("TOTAL", colTotalX, tableTop, {
                        width: contentWidth * 0.15,
                        align: "right",
                    });

                // Header line
                doc.moveTo(margin, tableTop + 12)
                    .lineTo(pageWidth - margin, tableTop + 12)
                    .lineWidth(1.5)
                    .stroke("#000");

                let currentLineItemY = tableTop + 20;

                // Table rows
                data.line_items.forEach((item, index) => {
                    const rowY = currentLineItemY;

                    // Serial number
                    doc.fontSize(9)
                        .font("Helvetica-Bold")
                        .fillColor("#000")
                        .text(String(index + 1), colSNoX, rowY, { width: 30, align: "center" });

                    // Line item human readable id
                    doc.fontSize(10)
                        .font("Helvetica")
                        .fillColor("#000")
                        .text(item.line_item_id, colDescX, rowY, {
                            width: contentWidth * 0.45,
                            continued: false,
                        });

                    // description
                    if (item.description) {
                        doc.fontSize(8)
                            .font("Helvetica")
                            .fillColor("#666")
                            .text(item.description, colDescX, doc.y + 2, {
                                width: contentWidth * 0.45,
                                continued: false,
                            });
                    }

                    // Quantity
                    doc.fontSize(10)
                        .font("Helvetica-Bold")
                        .fillColor("#000")
                        .text(String(item.quantity), colQtyX, rowY, {
                            width: contentWidth * 0.1,
                            align: "center",
                            continued: false,
                        });

                    // Unit Rate
                    doc.fontSize(10)
                        .font("Helvetica")
                        .fillColor("#000")
                        .text(formatCurrency(String(item.unit_rate)), colRateX, rowY, {
                            width: contentWidth * 0.15,
                            align: "right",
                            continued: false,
                        });

                    // Total
                    doc.fontSize(10)
                        .font("Helvetica-Bold")
                        .fillColor("#000")
                        .text(formatCurrency(String(item.total)), colTotalX, rowY, {
                            width: contentWidth * 0.15,
                            align: "right",
                            continued: false,
                        });

                    currentLineItemY = doc.y + 25; // Increased row height

                    // Dotted separator
                    if (index < data.line_items.length - 1) {
                        doc.moveTo(margin, currentLineItemY - 7)
                            .lineTo(pageWidth - margin, currentLineItemY - 7)
                            .dash(3, { space: 3 })
                            .lineWidth(0.5)
                            .stroke("#ddd")
                            .undash();
                    }
                });

                // Bottom line
                doc.moveTo(margin, currentLineItemY)
                    .lineTo(pageWidth - margin, currentLineItemY)
                    .lineWidth(1.5)
                    .stroke("#000");

                // Subtotal Row
                const subTotalY = currentLineItemY + 10;
                doc.fontSize(10)
                    .font("Helvetica-Bold")
                    .fillColor("#000")
                    .text("Total", colRateX, subTotalY, {
                        width: contentWidth * 0.15,
                        align: "right",
                    });

                doc.fontSize(10)
                    .font("Helvetica-Bold")
                    .fillColor("#000")
                    .text(
                        formatCurrency(data.line_items_sub_total.toString()),
                        colTotalX,
                        subTotalY,
                        {
                            width: contentWidth * 0.15,
                            align: "right",
                        }
                    );

                doc.y = subTotalY + 30;
            } else {
                doc.y = currentY + 20;
            }

            // ============================================================
            // PRICING SUMMARY
            // ============================================================
            const summaryX = pageWidth - margin - 260;
            const summaryWidth = 260;

            if (data.pricing.show_breakdown) {
                // Logistics
                doc.fontSize(10)
                    .font("Helvetica")
                    .fillColor("#555")
                    .text("Logistics Base Cost", summaryX, doc.y);

                doc.fontSize(10)
                    .font("Helvetica")
                    .fillColor("#000")
                    .text(formatCurrency(data.pricing.logistics_sub_total), summaryX, doc.y - 12, {
                        align: "right",
                        width: summaryWidth,
                    });

                doc.moveDown(0.6);

                // Line Items (Catalog + Custom)
                const lineItemsTotal = parseFloat(data.pricing.service_fee);
                if (lineItemsTotal > 0) {
                    doc.fontSize(10)
                        .font("Helvetica")
                        .fillColor("#555")
                        .text("Service Fee", summaryX, doc.y);

                    doc.fontSize(10)
                        .font("Helvetica")
                        .fillColor("#000")
                        .text(formatCurrency(data.pricing.service_fee), summaryX, doc.y - 12, {
                            align: "right",
                            width: summaryWidth,
                        });

                    doc.moveDown(0.6);
                }

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

            // Total
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
                .text(formatCurrency(data.pricing.final_total), summaryX + 15, totalY + 12, {
                    align: "right",
                    width: summaryWidth - 30,
                });

            doc.y = totalY + totalHeight + 25;

            // ============================================================
            // NOTES
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
                doc.circle(margin + 3, doc.y + 3, 2).fill("#000");
                doc.fontSize(8)
                    .font("Helvetica")
                    .fillColor("#333")
                    .text(note, margin + 12, doc.y, { width: contentWidth - 12 });
                doc.moveDown(0.3);
            });

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
            console.error("=== Inbound Invoice PDF Generation Failed ===");
            console.error("Error:", error);
            reject(error);
        }
    });
}
