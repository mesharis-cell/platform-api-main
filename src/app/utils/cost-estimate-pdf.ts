import PDFDocument from "pdfkit";
import { InvoicePayload } from "./invoice";
import { formatDateForEmail } from "./date-time";

const formatCurrency = (amount: string): string => {
    const num = parseFloat(amount);
    return `AED ${num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Hardcoded platform company details (will move to platform config later)
const PLATFORM_LEGAL = {
    name: "PMG Agency FZ-LLC",
    address: "Office 406, Emmay Tower, Al Sufouh-2, Dubai",
    license: "93718",
};

// ============================================================
// COST ESTIMATE PDF
// ============================================================
export async function renderCostEstimatePDF(
    data: InvoicePayload & { estimate_date: Date }
): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: "A4", margin: 45 });
            const chunks: Buffer[] = [];

            doc.on("data", (chunk: Buffer) => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", (error: Error) => reject(error));

            const pageWidth = doc.page.width;
            const pageHeight = doc.page.height;
            const margin = 40;
            const contentWidth = pageWidth - margin * 2;

            // ============================================================
            // HEADER — Platform company details
            // ============================================================

            // Company name as logo text
            doc.fontSize(28)
                .font("Helvetica-Bold")
                .fillColor("#1a1a2e")
                .text(PLATFORM_LEGAL.name.split(" ")[0], margin, margin);

            doc.moveDown(0.5);

            doc.fontSize(10)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text(PLATFORM_LEGAL.name, margin, doc.y);

            doc.fontSize(9)
                .font("Helvetica")
                .fillColor("#333")
                .text(PLATFORM_LEGAL.address, margin)
                .text(`License No. ${PLATFORM_LEGAL.license}`, margin);

            doc.moveDown(0.8);

            // Project reference + Client info (side by side)
            const refY = doc.y;

            doc.fontSize(10)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text(`Project: ${data.order_id}`, margin, refY, {
                    width: contentWidth * 0.55,
                });

            doc.fontSize(9)
                .font("Helvetica")
                .fillColor("#333")
                .text(
                    `Cost Estimate Issue Date: ${formatDateForEmail(data.estimate_date)}`,
                    margin,
                    doc.y + 2,
                    { width: contentWidth * 0.55 }
                );

            const clientX = margin + contentWidth * 0.55;
            doc.fontSize(10)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text(`Client: ${data.company_name}`, clientX, refY, {
                    width: contentWidth * 0.45,
                });

            doc.fontSize(9)
                .font("Helvetica")
                .fillColor("#333")
                .text(`Contact: ${data.contact_name}`, clientX, doc.y + 2, {
                    width: contentWidth * 0.45,
                });

            // Divider
            const dividerY = Math.max(doc.y, refY + 40) + 10;
            doc.moveTo(margin, dividerY)
                .lineTo(pageWidth - margin, dividerY)
                .lineWidth(2)
                .stroke("#1a1a2e");

            doc.y = dividerY + 15;

            // ============================================================
            // COST ESTIMATE title + CLIENT & INSTALLATION DETAILS
            // ============================================================

            doc.fontSize(20)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("COST ESTIMATE", margin, doc.y);

            doc.moveDown(1);

            const infoY = doc.y;

            // CLIENT section
            doc.fontSize(8).font("Helvetica-Bold").fillColor("#000").text("CLIENT", margin, infoY);
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

            // INSTALLATION DETAILS section
            const eventX = margin + contentWidth * 0.52;

            doc.fontSize(8)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("INSTALLATION DETAILS", eventX, infoY);

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
                .text(data.venue_name, eventX, doc.y + 3, {
                    width: contentWidth * 0.48,
                })
                .text(`${data.venue_city}, ${data.venue_country}`, eventX, doc.y + 2, {
                    width: contentWidth * 0.48,
                })
                .text(data.venue_address, eventX, doc.y + 2, {
                    width: contentWidth * 0.48,
                });

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

            doc.fontSize(8)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("S.No", colSNoX, tableTop, { width: 30, align: "center" })
                .text("ASSET NAME", colAssetX, tableTop)
                .text("QTY", colQtyX, tableTop, {
                    width: contentWidth * 0.1,
                    align: "center",
                })
                .text("NOTES", colNotesX, tableTop);

            doc.moveTo(margin, tableTop + 12)
                .lineTo(pageWidth - margin, tableTop + 12)
                .lineWidth(0.5)
                .stroke("#000");

            let rowY = tableTop + 18;
            const items = Array.isArray(data.items) ? data.items : [];

            items.forEach((item, index) => {
                if (rowY > pageHeight - 180) {
                    doc.addPage();
                    rowY = margin;
                }

                if (index % 2 === 0) {
                    doc.rect(margin, rowY - 3, contentWidth, 16).fill("#f8f8f8");
                }

                doc.fontSize(8)
                    .font("Helvetica")
                    .fillColor("#000")
                    .text(`${index + 1}`, colSNoX, rowY, {
                        width: 30,
                        align: "center",
                    })
                    .text(item.asset_name || "—", colAssetX, rowY, {
                        width: colQtyX - colAssetX - 10,
                    })
                    .text(`${item.quantity || 1}`, colQtyX, rowY, {
                        width: contentWidth * 0.1,
                        align: "center",
                    });

                const tags = Array.isArray(item.handling_tags)
                    ? item.handling_tags.join(", ")
                    : item.from_collection_name || "";

                if (tags) {
                    doc.fontSize(7)
                        .font("Helvetica")
                        .fillColor("#888")
                        .text(tags, colNotesX, rowY, {
                            width: pageWidth - margin - colNotesX,
                        });
                }

                rowY += 18;
            });

            doc.moveTo(margin, rowY)
                .lineTo(pageWidth - margin, rowY)
                .lineWidth(0.3)
                .stroke("#ccc");

            doc.y = rowY + 15;

            // ============================================================
            // LINE ITEMS SUMMARY (CLIENT-SAFE)
            // ============================================================
            const summaryX = pageWidth - margin - 300;
            const summaryWidth = 300;
            const lineRows = Array.isArray(data.line_items) ? data.line_items : [];

            doc.fontSize(8)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("COST BREAKDOWN", summaryX, doc.y);
            doc.rect(summaryX, doc.y + 2, 95, 1).fill("#000");
            doc.moveDown(0.9);

            if (lineRows.length === 0) {
                doc.fontSize(9)
                    .font("Helvetica")
                    .fillColor("#555")
                    .text("No billable lines added yet.", summaryX, doc.y);
                doc.moveDown(0.8);
            } else {
                lineRows.forEach((line, index) => {
                    const label = `${index + 1}. ${line.description}`;
                    const amountLabel =
                        line.total === null ? "" : formatCurrency(String(line.total));
                    const lineY = doc.y;

                    doc.fontSize(9)
                        .font("Helvetica")
                        .fillColor("#444")
                        .text(label, summaryX, lineY, { width: summaryWidth - 120 });
                    if (amountLabel) {
                        doc.fontSize(9)
                            .font("Helvetica-Bold")
                            .fillColor("#000")
                            .text(amountLabel, summaryX, lineY, {
                                align: "right",
                                width: summaryWidth,
                            });
                    }
                    doc.moveDown(0.55);
                });

                doc.moveTo(summaryX, doc.y + 3)
                    .lineTo(summaryX + summaryWidth, doc.y + 3)
                    .dash(4, { space: 4 })
                    .lineWidth(1)
                    .stroke("#999")
                    .undash();
                doc.moveDown(0.8);
            }

            doc.fontSize(10)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text("SUBTOTAL", summaryX, doc.y);
            doc.fontSize(12)
                .font("Helvetica-Bold")
                .fillColor("#000")
                .text(
                    formatCurrency(
                        String(data.pricing.subtotal_price || data.line_items_sub_total)
                    ),
                    summaryX,
                    doc.y - 14,
                    { align: "right", width: summaryWidth }
                );
            doc.moveDown(0.7);

            if (Number(data.pricing.vat_amount || 0) > 0) {
                doc.fontSize(10)
                    .font("Helvetica-Bold")
                    .fillColor("#000")
                    .text(`VAT (${data.pricing.vat_percent}%)`, summaryX, doc.y);
                doc.fontSize(11)
                    .font("Helvetica-Bold")
                    .fillColor("#000")
                    .text(formatCurrency(String(data.pricing.vat_amount)), summaryX, doc.y - 12, {
                        align: "right",
                        width: summaryWidth,
                    });
            }
            doc.moveDown(0.6);

            // Total with diagonal stripes
            const totalY = doc.y;
            const totalHeight = 45;

            doc.rect(summaryX, totalY, summaryWidth, totalHeight).lineWidth(2).stroke("#000");
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
                .text(formatCurrency(data.pricing.final_total_price), summaryX + 15, totalY + 12, {
                    align: "right",
                    width: summaryWidth - 30,
                });

            doc.y = totalY + totalHeight + 25;

            // ============================================================
            // NOTES
            // ============================================================
            doc.fontSize(8).font("Helvetica-Bold").fillColor("#000").text("NOTES", margin, doc.y);
            doc.rect(margin, doc.y + 2, 40, 1).fill("#000");
            doc.moveDown(1);

            const notes = [
                "This is an estimate only and not a final invoice.",
                "Final costs may vary based on actual requirements.",
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
                .text(
                    `${PLATFORM_LEGAL.name} | ${PLATFORM_LEGAL.address} | License No. ${PLATFORM_LEGAL.license}`,
                    margin,
                    footerY + 10,
                    { align: "center", width: contentWidth }
                );

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}
