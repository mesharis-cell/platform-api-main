import PDFDocument from 'pdfkit'
import { InvoicePayload } from './invoice'
import { formatDateForEmail } from './date-time'

const formatCurrency = (amount: string): string => {
    const num = parseFloat(amount)
    return `AED ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ============================================================
// SIMPLE INVOICE PDF - Minimalist, Clean Design
// ============================================================
export async function renderSimpleInvoicePDF(data: InvoicePayload & { invoice_number: string; invoice_date: Date }): Promise<Buffer> {
    console.log('=== Starting Simple Invoice PDF Generation ===')
    console.log('Invoice Number:', data.invoice_number)

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 60 })
            const chunks: Buffer[] = []

            doc.on('data', (chunk: Buffer) => {
                chunks.push(chunk)
            })

            doc.on('end', () => {
                const buffer = Buffer.concat(chunks)
                console.log('Simple Invoice PDF generated successfully, size:', buffer.length, 'bytes')
                resolve(buffer)
            })

            doc.on('error', (error: Error) => {
                console.error('=== Simple Invoice PDF Generation Error ===')
                console.error('Error:', error)
                reject(error)
            })

            const pageWidth = doc.page.width
            const margin = 60
            const contentWidth = pageWidth - margin * 2

            // ============================================================
            // HEADER - Simple and Clean
            // ============================================================
            doc.fontSize(32)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('INVOICE', margin, margin)

            doc.fontSize(10)
                .font('Helvetica')
                .fillColor('#666')
                .text('Your Company Name', margin, doc.y + 5)

            doc.moveDown(2)

            // ============================================================
            // INVOICE INFO - Simple Grid
            // ============================================================
            const infoY = doc.y

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#666')
                .text('Invoice Number', margin, infoY)

            doc.fontSize(11)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text(data.invoice_number, margin, infoY + 12)

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#666')
                .text('Invoice Date', margin + 150, infoY)

            doc.fontSize(11)
                .font('Helvetica')
                .fillColor('#000')
                .text(formatDateForEmail(data.invoice_date), margin + 150, infoY + 12)

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#666')
                .text('Order Reference', margin + 300, infoY)

            doc.fontSize(11)
                .font('Helvetica')
                .fillColor('#000')
                .text(data.order_id, margin + 300, infoY + 12)

            // Simple line separator
            doc.moveTo(margin, infoY + 40)
                .lineTo(pageWidth - margin, infoY + 40)
                .lineWidth(1)
                .stroke('#ddd')

            doc.y = infoY + 55

            // ============================================================
            // BILL TO & EVENT INFO
            // ============================================================
            const detailsY = doc.y

            // Bill To
            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('BILL TO', margin, detailsY)

            doc.fontSize(11)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text(data.company_name, margin, detailsY + 15)

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#555')
                .text(data.contact_name, margin, doc.y + 3)
                .text(data.contact_email, margin)
                .text(data.contact_phone, margin)

            // Event Details
            const eventX = margin + contentWidth * 0.5

            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('EVENT DETAILS', eventX, detailsY)

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#555')
                .text(
                    `${formatDateForEmail(data.event_start_date)} - ${formatDateForEmail(data.event_end_date)}`,
                    eventX,
                    detailsY + 15,
                    { width: contentWidth * 0.5 }
                )
                .text(data.venue_name, eventX, doc.y + 3, { width: contentWidth * 0.5 })
                .text(`${data.venue_city}, ${data.venue_country}`, eventX, doc.y + 2, { width: contentWidth * 0.5 })
                .text(data.venue_address, eventX, doc.y + 2, { width: contentWidth * 0.5 })

            doc.y = Math.max(doc.y, detailsY + 100)
            doc.moveDown(1.5)

            // ============================================================
            // ITEMS TABLE - Ultra Simple
            // ============================================================
            const tableTop = doc.y

            // Simple header line
            doc.moveTo(margin, tableTop)
                .lineTo(pageWidth - margin, tableTop)
                .lineWidth(1)
                .stroke('#000')

            const headerY = tableTop + 8

            const col1X = margin
            const col2X = margin + contentWidth * 0.7
            const col3X = margin + contentWidth * 0.82

            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('DESCRIPTION', col1X, headerY)
                .text('QTY', col2X, headerY, { width: contentWidth * 0.1, align: 'center' })
                .text('NOTES', col3X, headerY)

            let currentY = headerY + 18

            // Table rows
            data.items.forEach((item, index) => {
                const rowY = currentY

                // Asset name
                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#000')
                    .text(item.asset_name, col1X, rowY, {
                        width: contentWidth * 0.65,
                        continued: false,
                    })

                // Quantity
                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#000')
                    .text(String(item.quantity), col2X, rowY, {
                        width: contentWidth * 0.1,
                        align: 'center',
                        continued: false,
                    })

                // Notes
                let notesY = rowY
                if (item.from_collection_name) {
                    doc.fontSize(8)
                        .font('Helvetica')
                        .fillColor('#666')
                        .text(`From: ${item.from_collection_name}`, col3X, notesY, {
                            width: contentWidth * 0.18,
                            continued: false,
                        })
                    notesY = doc.y
                }

                if (item.handling_tags && item.handling_tags.length > 0) {
                    const tagsText = item.handling_tags.join(', ')
                    doc.fontSize(8)
                        .font('Helvetica')
                        .fillColor('#999')
                        .text(tagsText, col3X, notesY, {
                            width: contentWidth * 0.18,
                            continued: false,
                        })
                }

                currentY = doc.y + 15
            })

            // Bottom line
            doc.moveTo(margin, currentY)
                .lineTo(pageWidth - margin, currentY)
                .lineWidth(1)
                .stroke('#000')

            doc.y = currentY + 20

            // ============================================================
            // PRICING - Simple Right-Aligned
            // ============================================================
            const pricingX = pageWidth - margin - 220
            const pricingWidth = 220

            if (data.pricing.show_breakdown) {
                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#555')
                    .text('Logistics Base Cost', pricingX, doc.y)

                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#000')
                    .text(
                        formatCurrency(data.pricing.logistics_base_price),
                        pricingX,
                        doc.y - 12,
                        { align: 'right', width: pricingWidth }
                    )

                doc.moveDown(0.6)

                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#555')
                    .text(`Service Fee (${data.pricing.platform_margin_percent}%)`, pricingX, doc.y)

                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#000')
                    .text(
                        formatCurrency(data.pricing.platform_margin_amount),
                        pricingX,
                        doc.y - 12,
                        { align: 'right', width: pricingWidth }
                    )

                doc.moveDown(0.8)

                // Simple line
                doc.moveTo(pricingX, doc.y)
                    .lineTo(pricingX + pricingWidth, doc.y)
                    .lineWidth(1)
                    .stroke('#ddd')

                doc.moveDown(0.5)
            }

            // Total
            doc.fontSize(12)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('Total Amount Due', pricingX, doc.y)

            doc.fontSize(16)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text(
                    formatCurrency(data.pricing.final_total_price),
                    pricingX,
                    doc.y - 15,
                    { align: 'right', width: pricingWidth }
                )

            doc.moveDown(1.2)

            // ============================================================
            // PAYMENT INFO - Simple Text
            // ============================================================
            doc.fontSize(9)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('Payment Instructions', margin, doc.y)

            doc.moveDown(0.4)

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#555')
                .text('Payment Method: Bank Transfer or Check', margin)
                .text('Payment Terms: Net 30 Days')
                .text(`Payment Reference: ${data.invoice_number}`)

            doc.moveDown(0.2)

            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#999')
                .text(
                    'Please include the invoice number in your payment reference.',
                    margin,
                    doc.y,
                    { width: contentWidth * 0.7 }
                )

            doc.moveDown(1.5)

            // ============================================================
            // FOOTER - Simple
            // ============================================================
            const footerY = doc.y

            doc.moveTo(margin, footerY)
                .lineTo(pageWidth - margin, footerY)
                .lineWidth(0.5)
                .stroke('#ddd')

            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#999')
                .text('Thank you for your business', margin, footerY + 10, {
                    align: 'center',
                    width: contentWidth,
                })

            doc.end()
        } catch (error) {
            console.error('=== Simple Invoice PDF Generation Failed ===')
            console.error('Error:', error)
            if (error instanceof Error) {
                console.error('Stack:', error.stack)
            }
            reject(error)
        }
    })
}
