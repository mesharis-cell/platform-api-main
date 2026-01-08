import PDFDocument from 'pdfkit'
import { InvoicePayload } from './invoice'
import { formatDateForEmail } from './date-time'

const formatCurrency = (amount: string): string => {
    const num = parseFloat(amount)
    return `AED ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ============================================================
// ALTERNATIVE INVOICE PDF - Sidebar Layout Design
// ============================================================
export async function renderAlternativeInvoicePDF(data: InvoicePayload & { invoice_number: string; invoice_date: Date }): Promise<Buffer> {
    console.log('=== Starting Alternative Invoice PDF Generation ===')
    console.log('Invoice Number:', data.invoice_number)

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 0 })
            const chunks: Buffer[] = []

            doc.on('data', (chunk: Buffer) => {
                chunks.push(chunk)
            })

            doc.on('end', () => {
                const buffer = Buffer.concat(chunks)
                console.log('Alternative Invoice PDF generated successfully, size:', buffer.length, 'bytes')
                resolve(buffer)
            })

            doc.on('error', (error: Error) => {
                console.error('=== Alternative Invoice PDF Generation Error ===')
                console.error('Error:', error)
                reject(error)
            })

            const pageWidth = doc.page.width
            const pageHeight = doc.page.height
            const sidebarWidth = 180
            const mainMargin = 40
            const mainContentX = sidebarWidth + mainMargin
            const mainContentWidth = pageWidth - sidebarWidth - mainMargin * 2

            // ============================================================
            // LEFT SIDEBAR - Dark Background
            // ============================================================
            doc.rect(0, 0, sidebarWidth, pageHeight)
                .fill('#1a1a1a')

            // Vertical accent line
            doc.rect(sidebarWidth - 3, 0, 3, pageHeight)
                .fill('#000')

            // Company name in sidebar
            doc.fontSize(11)
                .font('Helvetica-Bold')
                .fillColor('#fff')
                .text('YOUR COMPANY', 20, 50, { width: sidebarWidth - 40 })

            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#999')
                .text('NAME', 20, doc.y, { width: sidebarWidth - 40 })

            // Invoice details in sidebar
            let sidebarY = 120

            // Invoice Number
            doc.fontSize(7)
                .font('Helvetica')
                .fillColor('#666')
                .text('INVOICE NUMBER', 20, sidebarY, { width: sidebarWidth - 40 })

            doc.fontSize(11)
                .font('Helvetica-Bold')
                .fillColor('#fff')
                .text(data.invoice_number, 20, sidebarY + 12, { width: sidebarWidth - 40 })

            sidebarY += 45

            // Invoice Date
            doc.fontSize(7)
                .font('Helvetica')
                .fillColor('#666')
                .text('INVOICE DATE', 20, sidebarY, { width: sidebarWidth - 40 })

            doc.fontSize(10)
                .font('Helvetica')
                .fillColor('#fff')
                .text(formatDateForEmail(data.invoice_date), 20, sidebarY + 12, { width: sidebarWidth - 40 })

            sidebarY += 45

            // Order Reference
            doc.fontSize(7)
                .font('Helvetica')
                .fillColor('#666')
                .text('ORDER REFERENCE', 20, sidebarY, { width: sidebarWidth - 40 })

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#fff')
                .text(data.order_id, 20, sidebarY + 12, { width: sidebarWidth - 40 })

            // Total Amount in sidebar (highlighted)
            const totalBoxY = pageHeight - 180

            doc.rect(20, totalBoxY, sidebarWidth - 40, 100)
                .lineWidth(1)
                .stroke('#333')

            doc.fontSize(7)
                .font('Helvetica-Bold')
                .fillColor('#666')
                .text('TOTAL AMOUNT DUE', 30, totalBoxY + 15, { width: sidebarWidth - 60 })

            doc.fontSize(18)
                .font('Helvetica-Bold')
                .fillColor('#fff')
                .text(
                    formatCurrency(data.pricing.final_total_price),
                    30,
                    totalBoxY + 35,
                    { width: sidebarWidth - 60, align: 'left' }
                )

            doc.fontSize(7)
                .font('Helvetica')
                .fillColor('#666')
                .text('Payment due within 30 days', 30, totalBoxY + 70, { width: sidebarWidth - 60 })

            // ============================================================
            // MAIN CONTENT AREA
            // ============================================================

            // Large INVOICE text
            doc.fontSize(48)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('INVOICE', mainContentX, 50, { width: mainContentWidth })

            doc.moveDown(1.5)

            // ============================================================
            // BILL TO & EVENT DETAILS
            // ============================================================
            const infoY = doc.y

            // Bill To
            doc.fontSize(8)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('BILL TO', mainContentX, infoY)

            // Thin underline
            doc.moveTo(mainContentX, infoY + 12)
                .lineTo(mainContentX + 60, infoY + 12)
                .lineWidth(1)
                .stroke('#000')

            doc.fontSize(12)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text(data.company_name, mainContentX, infoY + 22)

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#444')
                .text(data.contact_name, mainContentX, doc.y + 4)
                .text(data.contact_email, mainContentX)
                .text(data.contact_phone, mainContentX)

            // Event Details
            const eventX = mainContentX + mainContentWidth * 0.5

            doc.fontSize(8)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('EVENT DETAILS', eventX, infoY)

            doc.moveTo(eventX, infoY + 12)
                .lineTo(eventX + 90, infoY + 12)
                .lineWidth(1)
                .stroke('#000')

            doc.fontSize(9)
                .font('Helvetica')
                .fillColor('#444')
                .text(
                    `${formatDateForEmail(data.event_start_date)} - ${formatDateForEmail(data.event_end_date)}`,
                    eventX,
                    infoY + 22,
                    { width: mainContentWidth * 0.5 }
                )
                .text(data.venue_name, eventX, doc.y + 4, { width: mainContentWidth * 0.5 })
                .text(`${data.venue_city}, ${data.venue_country}`, eventX, doc.y + 2, { width: mainContentWidth * 0.5 })
                .text(data.venue_address, eventX, doc.y + 2, { width: mainContentWidth * 0.5 })

            doc.y = Math.max(doc.y, infoY + 120)
            doc.moveDown(2)

            // ============================================================
            // ITEMS TABLE - Minimalist Design
            // ============================================================
            const tableTop = doc.y

            // Simple header line
            doc.moveTo(mainContentX, tableTop)
                .lineTo(pageWidth - mainMargin, tableTop)
                .lineWidth(2)
                .stroke('#000')

            const headerY = tableTop + 10

            const col1X = mainContentX
            const col2X = mainContentX + mainContentWidth * 0.65
            const col3X = mainContentX + mainContentWidth * 0.77

            doc.fontSize(8)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('DESCRIPTION', col1X, headerY)
                .text('QTY', col2X, headerY, { width: mainContentWidth * 0.1, align: 'center' })
                .text('NOTES', col3X, headerY)

            let currentY = headerY + 20

            // Table rows
            data.items.forEach((item, index) => {
                const rowY = currentY

                // Item number
                doc.fontSize(8)
                    .font('Helvetica-Bold')
                    .fillColor('#ccc')
                    .text(`${index + 1}.`, col1X, rowY, { width: 20 })

                // Asset name
                doc.fontSize(10)
                    .font('Helvetica')
                    .fillColor('#000')
                    .text(item.asset_name, col1X + 25, rowY, {
                        width: mainContentWidth * 0.6,
                        continued: false,
                    })

                // Quantity in box
                const qtyBoxX = col2X + (mainContentWidth * 0.1 - 25) / 2
                doc.rect(qtyBoxX, rowY - 2, 25, 18)
                    .lineWidth(1)
                    .stroke('#ddd')

                doc.fontSize(10)
                    .font('Helvetica-Bold')
                    .fillColor('#000')
                    .text(String(item.quantity), col2X, rowY, {
                        width: mainContentWidth * 0.1,
                        align: 'center',
                        continued: false,
                    })

                // Notes
                let notesY = rowY
                if (item.from_collection_name) {
                    doc.fontSize(7)
                        .font('Helvetica')
                        .fillColor('#666')
                        .text(`From: ${item.from_collection_name}`, col3X, notesY, {
                            width: mainContentWidth * 0.23,
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
                            width: mainContentWidth * 0.23,
                            continued: false,
                        })
                }

                currentY = doc.y + 20

                // Subtle separator
                if (index < data.items.length - 1) {
                    doc.moveTo(mainContentX, currentY - 10)
                        .lineTo(pageWidth - mainMargin, currentY - 10)
                        .lineWidth(0.5)
                        .stroke('#eee')
                }
            })

            // Bottom line
            doc.moveTo(mainContentX, currentY)
                .lineTo(pageWidth - mainMargin, currentY)
                .lineWidth(2)
                .stroke('#000')

            doc.y = currentY + 25

            // ============================================================
            // PRICING BREAKDOWN
            // ============================================================
            if (data.pricing.show_breakdown) {
                const pricingX = pageWidth - mainMargin - 240
                const pricingWidth = 240

                doc.fontSize(9)
                    .font('Helvetica')
                    .fillColor('#666')
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

                doc.moveDown(0.7)

                doc.fontSize(9)
                    .font('Helvetica')
                    .fillColor('#666')
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

                doc.moveDown(1)
            }

            // ============================================================
            // PAYMENT INSTRUCTIONS
            // ============================================================
            doc.moveDown(2)

            doc.fontSize(8)
                .font('Helvetica-Bold')
                .fillColor('#000')
                .text('PAYMENT INSTRUCTIONS', mainContentX, doc.y)

            doc.moveDown(0.5)

            doc.fontSize(8)
                .font('Helvetica')
                .fillColor('#444')
                .text('Payment Method: Bank Transfer or Check', mainContentX)
                .text('Payment Terms: Net 30 Days')
                .text(`Payment Reference: ${data.invoice_number}`)

            doc.moveDown(0.4)

            doc.fontSize(7)
                .font('Helvetica')
                .fillColor('#666')
                .text(
                    'Please include the invoice number in your payment reference to ensure proper processing.',
                    mainContentX,
                    doc.y,
                    { width: mainContentWidth * 0.7 }
                )

            // ============================================================
            // FOOTER
            // ============================================================
            const footerY = pageHeight - 30

            doc.fontSize(7)
                .font('Helvetica')
                .fillColor('#999')
                .text('Thank you for your business', mainContentX, footerY, {
                    width: mainContentWidth,
                    align: 'center',
                })

            doc.end()
        } catch (error) {
            console.error('=== Alternative Invoice PDF Generation Failed ===')
            console.error('Error:', error)
            if (error instanceof Error) {
                console.error('Stack:', error.stack)
            }
            reject(error)
        }
    })
}
