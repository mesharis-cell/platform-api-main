import PDFDocument from "pdfkit";
import { formatDateForEmail } from "./date-time";
import { InboundRequestCostEstimatePayload } from "./inbound-request-cost-estimate";

const formatCurrency = (amount: string): string => {
    const num = parseFloat(amount);
    return `AED ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ============================================================
// INBOUND REQUEST COST ESTIMATE PDF
// ============================================================
export async function renderInboundRequestCostEstimatePDF(
    data: InboundRequestCostEstimatePayload & { estimate_date: Date }
): Promise<Buffer> {
    console.log("=== Starting Inbound Request Cost Estimate PDF Generation ===");
    console.log("Inbound Request ID:", data.inbound_request_id);

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: "A4", margin: 45 });
            const chunks: Buffer[] = [];

            doc.on("data", (chunk: Buffer) => {
                chunks.push(chunk);
            });

            doc.on("end", () => {
                const buffer = Buffer.concat(chunks);
                console.log("Cost Estimate PDF generated successfully, size:", buffer.length, "bytes");
                resolve(buffer);
            });

            doc.on("error", (error: Error) => {
                console.error("=== Cost Estimate PDF Generation Error ===");
                console.error("Error:", error);
                reject(error);
            });

            const pageWidth = doc.page.width;
            const pageHeight = doc.page.height;
            const margin = 40;
            const contentWidth = pageWidth - margin * 2;

            // ============================================================
            // HEADER - Minimalist Design (Following cost-estimate.ts)
            // ============================================================
            // Diagonal corner accent
            doc.moveTo(0, 0).lineTo(60, 0).lineTo(0, 60).fill("#000");

            doc.fontSize(36)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("COST", margin, margin, { align: "left" });

            doc.fontSize(36)
                .font("Helvetica")
                .fillColor("#666")
                .text("ESTIMATE", margin, doc.y, { align: "left" });

            doc.moveDown(1);

            // Estimate details in grid
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
                .text(formatDateForEmail(data.estimate_date), dateBoxX + 10, detailsY + 20, {
                    width: detailBoxWidth - 20,
                });

            // Request Reference
            const refBoxX = dateBoxX + detailBoxWidth + 10;
            doc.rect(refBoxX, detailsY, detailBoxWidth, 40).lineWidth(1).stroke("#ccc");

            doc.fontSize(7)
                .font("Helvetica-Bold")
                .fillColor("#666")
                .text("REQUEST REF", refBoxX + 10, detailsY + 8, { width: detailBoxWidth - 20 });

            doc.fontSize(8)
                .font("Helvetica")
                .fillColor("#000")
                .text(data.inbound_request_id.toUpperCase(), refBoxX + 10, detailsY + 20, { width: detailBoxWidth - 20 });

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

                // Category
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

            doc.y = currentY + 20;

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

                // Service Fee
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
                .text("ESTIMATED TOTAL", summaryX + 15, totalY + 12);

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
                "This is an estimate only and not a final invoice",
                "Final costs may vary based on actual requirements",
                "Estimate valid for 30 days from the estimate date",
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
                .text("Thank you for considering our services", margin, footerY + 10, {
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
            console.error("=== Inbound Request Cost Estimate PDF Generation Failed ===");
            console.error("Error:", error);
            reject(error);
        }
    });
}
