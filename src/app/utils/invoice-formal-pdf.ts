import PDFDocument from 'pdfkit'
import { InvoicePayload } from './invoice'
import { formatDateForEmail } from './date-time'

const formatCurrency = (amount: string): string => {
    const num = parseFloat(amount)
    return `AED ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ============================================================
// FORMAL INVOICE PDF - Black & White Design
// ============================================================
export async function renderFormalInvoicePDF(data: InvoicePayload & { invoice_number: string; invoice_date: Date }): Promise<Buffer> {
    console.log('=== Starting Formal Invoice PDF Generation ===')
    console.log('Invoice Number:', data.invoice_number)

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 50 })
            const chunks: Buffer[] = []

            doc.on('data', (chunk: Buffer) => {
                chunks.push(chunk)
            })

            doc.on('end', () => {
                const buffer = Buffer.concat(chunks)
                console.log('Formal Invoice PDF generated successfully, size:', buffer.length, 'bytes')
                resolve(buffer)
            })

            doc.on('error', (error: Error) => {
                console.error('=== Formal Invoice PDF Generation Error ===')
                console.error('Error:', error)
                reject(error)
            })

            const pageWidth = doc.page.width
            const pageHeight = doc.page.height
            const margin = 50
            const contentWidth = pageWidth - margin * 2

            // ============================================================
            // DECORATIVE TOP BORDER
            // ============================================================
            doc.rect(0, 0, pageWidth, 3).fill('#000')
            doc.rect(0, 5, pageWidth, 1).fill('#000')

            // ============================================================
            // HEADER - BOLD TYPOGRAPHY
            // ============================================================
            doc.fontSize(42)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('INVOICE', margin, margin + 10, { align: 'left' })

            // Company name in lighter weight
            doc.fontSize(10)
                .font('Helvetica')
                .fillColor('#666')
                .text('YOUR COMPANY NAME', margin, margin + 60, { align: 'left' })

            // ============================================================
            // INVOICE DETAILS BOX - Right Side
            // ============================================================
            const boxX = pageWidth - margin - 220
            const boxY = margin + 10
            const boxWidth = 220
            const boxHeight = 90

            // Double border box
            doc.rect(boxX, boxY, boxWidth, boxHeight)
                .lineWidth(2)
                .stroke('#000')

            doc.rect(boxX + 3, boxY + 3, boxWidth - 6, boxHeight - 6)
                .lineWidth(0.5)
                .stroke('#000')

            // Content inside box
            let boxContentY = boxY + 15

            doc.fontSize(8)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('INVOICE NUMBER', boxX + 15, boxContentY, { width: boxWidth - 30 })

            doc.fontSize(11)
                .font('Helvetica')
                .fillColor('#000')
                .text(data.invoice_number, boxX + 15, boxContentY + 12, { width: boxWidth - 30 })

            boxContentY += 30

            doc.fontSize(8)
                .font('Helvetica-Bold')
                .text('DATE', boxX + 15, boxContentY, { width: boxWidth - 30 })

            doc.fontSize(10)
                .font('Helvetica')
                .text(formatDateForEmail(data.invoice_date), boxX + 15, boxContentY + 12, { width: boxWidth - 30 })

            boxContentY += 25

            doc.fontSize(8)
                .font('Helvetica-Bold')
                .text('ORDER REF', boxX + 15, boxContentY, { width: boxWidth - 30 })

            doc.fontSize(9)
                .font('Helvetica')
                .text(data.order_id, boxX + 15, boxContentY + 12, { width: boxWidth - 30 })

            // ============================================================
            // BILLING & EVENT INFO - Two Columns
            // ============================================================
            const infoY = boxY + boxHeight + 30

            // Left Column - Bill To
            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('BILL TO', margin, infoY)

            // Underline
            doc.moveTo(margin, infoY + 12)
                .lineTo(margin + 80, infoY + 12)
                .lineWidth(2)
                .stroke('#000')

            doc.fontSize(11)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text(data.company_name, margin, infoY + 22)

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#333')
                .text(data.contact_name, margin, doc.y + 5)
                .text(data.contact_email, margin)
                .text(data.contact_phone, margin)

            // Right Column - Event Details
            const rightColX = margin + contentWidth * 0.55

            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('EVENT DETAILS', rightColX, infoY)

            // Underline
            doc.moveTo(rightColX, infoY + 12)
                .lineTo(rightColX + 100, infoY + 12)
                .lineWidth(2)
                .stroke('#000')

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#333')
                .text(
                    `${formatDateForEmail(data.event_start_date)} - ${formatDateForEmail(data.event_end_date)}`,
                    rightColX,
                    infoY + 22,
                    { width: contentWidth * 0.45 }
                )
                .text(data.venue_name, rightColX, doc.y + 5, { width: contentWidth * 0.45 })
                .text(`${data.venue_city}, ${data.venue_country}`, rightColX, doc.y + 2, { width: contentWidth * 0.45 })
                .text(data.venue_address, rightColX, doc.y + 2, { width: contentWidth * 0.45 })

            doc.y = Math.max(doc.y, infoY + 100)
            doc.moveDown(2)

            // ============================================================
            // ITEMS TABLE - Clean Grid Design
            // ============================================================
            const tableTop = doc.y

            // Header background with pattern
            doc.rect(margin, tableTop, contentWidth, 30)
                .fill('#000')

            // Header text
            const col1X = margin + 15
            const col2X = margin + contentWidth * 0.65
            const col3X = margin + contentWidth * 0.78

            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#fff')
                .text('DESCRIPTION', col1X, tableTop + 10, { width: contentWidth * 0.6 })
                .text('QTY', col2X, tableTop + 10, { width: contentWidth * 0.1, align: 'center' })
                .text('NOTES', col3X, tableTop + 10, { width: contentWidth * 0.2 })

            let currentY = tableTop + 35

            // Table rows
            data.items.forEach((item, index) => {
                const rowHeight = 35 + (item.handling_tags?.length > 0 ? 12 : 0) + (item.from_collection_name ? 12 : 0)

                // Alternating background with subtle pattern
                if (index % 2 === 1) {
                    doc.rect(margin, currentY, contentWidth, rowHeight)
                        .fill('#f5f5f5')
                }

                // Left border accent
                doc.rect(margin, currentY, 3, rowHeight)
                    .fill('#000')

                // Asset name
                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#000')
                    .text(item.asset_name, col1X, currentY + 10, {
                        width: contentWidth * 0.6,
                        continued: false,
                    })

                // Quantity in circle
                const qtyX = col2X + (contentWidth * 0.1) / 2
                doc.circle(qtyX, currentY + 17, 12)
                    .lineWidth(1.5)
                    .stroke('#000')

                doc.fontSize(10)
                    .font('Helvetica-Bold')
                    .fillColor('#000')
                    .text(String(item.quantity), col2X, currentY + 10, {
                        width: contentWidth * 0.1,
                        align: 'center',
                        continued: false,
                    })

                // Notes
                let notesY = currentY + 10
                if (item.from_collection_name) {
                    doc.fontSize(8)
                        .font('Helvetica')
                        .fillColor('#666')
                        .text(`From: ${item.from_collection_name}`, col3X, notesY, {
                            width: contentWidth * 0.2,
                            continued: false,
                        })
                    notesY = doc.y
                }

                if (item.handling_tags && item.handling_tags.length > 0) {
                    const tagsText = item.handling_tags.join(', ')
                    doc.fontSize(7)
                        .font('Helvetica')
                        .fillColor('#999')
                        .text(tagsText, col3X, notesY, {
                            width: contentWidth * 0.2,
                            continued: false,
                        })
                }

                currentY += rowHeight
            })

            // Bottom border
            doc.rect(margin, currentY, contentWidth, 3)
                .fill('#000')

            doc.y = currentY + 25

            // ============================================================
            // PRICING SUMMARY - Right Aligned
            // ============================================================
            const summaryX = pageWidth - margin - 280
            const summaryWidth = 280

            if (data.pricing.show_breakdown) {
                // Subtotal
                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#333')
                    .text('Logistics Base Cost', summaryX, doc.y)

                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#000')
                    .text(
                        formatCurrency(data.pricing.logistics_base_price),
                        summaryX,
                        doc.y - 12,
                        { align: 'right', width: summaryWidth }
                    )

                doc.moveDown(0.8)

                // Service fee
                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#333')
                    .text(`Service Fee (${data.pricing.platform_margin_percent}%)`, summaryX, doc.y)

                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#000')
                    .text(
                        formatCurrency(data.pricing.platform_margin_amount),
                        summaryX,
                        doc.y - 12,
                        { align: 'right', width: summaryWidth }
                    )

                doc.moveDown(1)

                // Separator
                doc.moveTo(summaryX, doc.y)
                    .lineTo(summaryX + summaryWidth, doc.y)
                    .lineWidth(1)
                    .stroke('#ccc')

                doc.moveDown(0.5)
            }

            // Total in bold box
            const totalBoxY = doc.y
            const totalBoxHeight = 50

            doc.rect(summaryX, totalBoxY, summaryWidth, totalBoxHeight)
                .lineWidth(3)
                .stroke('#000')

            doc.fontSize(11)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('TOTAL AMOUNT DUE', summaryX + 15, totalBoxY + 13)

            doc.fontSize(20)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text(
                    formatCurrency(data.pricing.final_total_price),
                    summaryX + 15,
                    totalBoxY + 13,
                    { align: 'right', width: summaryWidth - 30 }
                )

            doc.y = totalBoxY + totalBoxHeight + 30

            // ============================================================
            // PAYMENT INSTRUCTIONS
            // ============================================================
            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('PAYMENT INSTRUCTIONS', margin, doc.y)

            doc.moveTo(margin, doc.y + 2)
                .lineTo(margin + 140, doc.y + 2)
                .lineWidth(1.5)
                .stroke('#000')

            doc.moveDown(0.5)

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#333')
                .text('Payment Method: Bank Transfer or Check', margin)
                .text('Payment Terms: Net 30 Days')
                .text(`Payment Reference: ${data.invoice_number}`)

            doc.moveDown(0.3)

            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#666')
                .text(
                    'Please include the invoice number in your payment reference to ensure proper processing.',
                    margin,
                    doc.y,
                    { width: contentWidth * 0.7 }
                )

            // ============================================================
            // FOOTER
            // ============================================================
            const footerY = pageHeight - 50

            doc.moveTo(margin, footerY)
                .lineTo(pageWidth - margin, footerY)
                .lineWidth(0.5)
                .stroke('#ccc')

            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#999')
                .text('Thank you for your business', margin, footerY + 10, {
                    align: 'center',
                    width: contentWidth,
                })

            // Bottom decorative border
            doc.rect(0, pageHeight - 3, pageWidth, 3).fill('#000')

            doc.end()
        } catch (error) {
            console.error('=== Formal Invoice PDF Generation Failed ===')
            console.error('Error:', error)
            if (error instanceof Error) {
                console.error('Stack:', error.stack)
            }
            reject(error)
        }
    })
}
