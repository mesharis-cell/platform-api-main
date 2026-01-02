import PDFDocument from 'pdfkit'
import { InvoicePayload } from './invoice'
import { formatDateForEmail } from './date-time'

const formatCurrency = (amount: string): string => {
    const num = parseFloat(amount)
    return `AED ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Render invoice PDF and return buffer using PDFKit
export async function renderInvoicePDF(data: InvoicePayload & { invoice_number: string; invoice_date: Date }): Promise<Buffer> {
    console.log('=== Starting PDF Generation with PDFKit ===')
    console.log('Invoice Number:', data.invoice_number)

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'A4', margin: 40 })
            const chunks: Buffer[] = []

            doc.on('data', (chunk: Buffer) => {
                chunks.push(chunk)
            })

            doc.on('end', () => {
                const buffer = Buffer.concat(chunks)
                console.log(
                    'PDF generated successfully, size:',
                    buffer.length,
                    'bytes'
                )
                console.log('=== PDF Generation Complete ===')
                resolve(buffer)
            })

            doc.on('error', (error: Error) => {
                console.error('=== PDF Generation Error ===')
                console.error('Error:', error)
                reject(error)
            })

            // Start building the PDF
            const pageWidth = doc.page.width
            const margin = 40
            const contentWidth = pageWidth - margin * 2

            // ============================================================
            // HEADER
            // ============================================================
            doc.fontSize(24)
                .fillColor('#000')
                .text('Cost Estimate', margin, margin, { align: 'left' })

            doc.moveDown(0.5)

            // Invoice details
            doc.fontSize(10)
                .fillColor('#000')
                .text(`Cost Estimate Number: ${data.invoice_number}`, margin)
                .text(`Cost Estimate Date: ${formatDateForEmail(data.invoice_date)}`)
                .text(`Order Reference: ${data.order_id}`)

            // Horizontal line
            doc.moveTo(margin, doc.y + 10)
                .lineTo(pageWidth - margin, doc.y + 10)
                .lineWidth(2)
                .stroke()

            doc.moveDown(2)

            // ============================================================
            // BILLING INFORMATION
            // ============================================================
            doc.fontSize(12)
                .fillColor('#333')
                .text('BILL TO', margin, doc.y, { underline: true })

            doc.moveDown(0.5)

            doc.fontSize(10)
                .fillColor('#000')
                .text(`Company: ${data.company_name}`, margin)
                .text(`Contact: ${data.contact_name}`)
                .text(`Email: ${data.contact_email}`)
                .text(`Phone: ${data.contact_phone}`)

            doc.moveDown(1.5)

            // ============================================================
            // EVENT DETAILS
            // ============================================================
            doc.fontSize(12)
                .fillColor('#333')
                .text('EVENT DETAILS', margin, doc.y, { underline: true })

            doc.moveDown(0.5)

            doc.fontSize(10)
                .fillColor('#000')
                .text(
                    `Event Dates: ${formatDateForEmail(data.event_start_date)} - ${formatDateForEmail(data.event_end_date)}`,
                    margin
                )
                .text(`Venue: ${data.venue_name}`)
                .text(
                    `Location: ${data.venue_city}, ${data.venue_country}`
                )
                .text(`Address: ${data.venue_address}`)

            doc.moveDown(1.5)

            // ============================================================
            // ITEMS TABLE
            // ============================================================
            doc.fontSize(12)
                .fillColor('#333')
                .text('ITEMS', margin, doc.y, { underline: true })

            doc.moveDown(0.5)

            const tableTop = doc.y
            const col1X = margin
            const col2X = margin + contentWidth * 0.5
            const col3X = margin + contentWidth * 0.65
            const col4X = margin + contentWidth * 0.8

            // Table header
            doc.fontSize(10)
                .fillColor('#000')
                .text('Asset Name', col1X, tableTop, {
                    width: contentWidth * 0.5,
                    continued: false,
                })
                .text('Quantity', col2X, tableTop, {
                    width: contentWidth * 0.15,
                    align: 'right',
                    continued: false,
                })
                .text('Notes', col3X, tableTop, {
                    width: contentWidth * 0.35,
                    continued: false,
                })

            // Header underline
            doc.moveTo(margin, doc.y + 5)
                .lineTo(pageWidth - margin, doc.y + 5)
                .lineWidth(1)
                .stroke()

            doc.moveDown(0.5)

            // Table rows
            data.items.forEach((item, index) => {
                const rowY = doc.y

                // Asset name
                doc.fontSize(10)
                    .fillColor('#000')
                    .text(item.asset_name, col1X, rowY, {
                        width: contentWidth * 0.5,
                        continued: false,
                    })

                // Quantity
                doc.text(String(item.quantity), col2X, rowY, {
                    width: contentWidth * 0.15,
                    align: 'right',
                    continued: false,
                })

                // Notes (collection + handling tags)
                let notesY = rowY
                if (item.from_collection_name) {
                    doc.fontSize(8)
                        .fillColor('#666')
                        .text(
                            `From: ${item.from_collection_name}`,
                            col3X,
                            notesY,
                            { width: contentWidth * 0.35, continued: false }
                        )
                    notesY = doc.y
                }

                if (item.handling_tags && item.handling_tags.length > 0) {
                    const tagsText = item.handling_tags.join(', ')
                    doc.fontSize(8)
                        .fillColor('#666')
                        .text(tagsText, col3X, notesY, {
                            width: contentWidth * 0.35,
                            continued: false,
                        })
                }

                // Row separator
                doc.moveTo(margin, doc.y + 3)
                    .lineTo(pageWidth - margin, doc.y + 3)
                    .lineWidth(0.5)
                    .strokeColor('#e0e0e0')
                    .stroke()

                doc.moveDown(0.3)
            })

            doc.moveDown(1)

            // ============================================================
            // PRICING SUMMARY
            // ============================================================
            // Top border
            doc.moveTo(margin, doc.y)
                .lineTo(pageWidth - margin, doc.y)
                .lineWidth(2)
                .strokeColor('#000')
                .stroke()

            doc.moveDown(0.5)

            doc.fontSize(12)
                .fillColor('#333')
                .text('PAYMENT SUMMARY', margin, doc.y, { underline: true })

            doc.moveDown(0.5)

            // Show breakdown if requested
            if (data.pricing.show_breakdown) {
                const pricingY = doc.y

                doc.fontSize(10)
                    .fillColor('#000')
                    .text('Logistics Base Cost:', margin, pricingY, {
                        continued: false,
                    })
                doc.text(
                    formatCurrency(data.pricing.logistics_base_price),
                    margin,
                    pricingY,
                    { align: 'right', continued: false }
                )

                doc.moveDown(0.3)

                const marginY = doc.y
                doc.fontSize(10)
                    .fillColor('#000')
                    .text(
                        `Service Fee (${data.pricing.platform_margin_percent}%):`,
                        margin,
                        marginY,
                        { continued: false }
                    )
                doc.text(
                    formatCurrency(data.pricing.platform_margin_amount),
                    margin,
                    marginY,
                    { align: 'right', continued: false }
                )

                doc.moveDown(0.5)
            }

            // Total line with border
            doc.moveTo(margin, doc.y)
                .lineTo(pageWidth - margin, doc.y)
                .lineWidth(1)
                .strokeColor('#000')
                .stroke()

            doc.moveDown(0.3)

            const totalY = doc.y
            doc.fontSize(14)
                .fillColor('#000')
                .text('Total Amount Due:', margin, totalY, { continued: false })
            doc.text(
                formatCurrency(data.pricing.final_total_price),
                margin,
                totalY,
                { align: 'right', continued: false }
            )

            doc.moveDown(1.5)

            // ============================================================
            // PAYMENT INSTRUCTIONS
            // ============================================================
            doc.fontSize(12)
                .fillColor('#333')
                .text('PAYMENT INSTRUCTIONS', margin, doc.y, {
                    underline: true,
                })

            doc.moveDown(0.5)

            doc.fontSize(10)
                .fillColor('#000')
                .text('Payment Method: Bank Transfer or Check', margin)
                .text('Payment Terms: Net 30 Days')
                .text(`Payment Reference: ${data.invoice_number}`)

            doc.moveDown(0.5)

            doc.fontSize(8)
                .fillColor('#666')
                .text(
                    'Please include the Cost Estimate number in your payment reference to ensure proper processing.',
                    margin,
                    doc.y,
                    { width: contentWidth }
                )

            // ============================================================
            // FOOTER
            // ============================================================
            const footerY = doc.page.height - 60

            doc.moveTo(margin, footerY)
                .lineTo(pageWidth - margin, footerY)
                .lineWidth(1)
                .strokeColor('#e0e0e0')
                .stroke()

            doc.fontSize(8)
                .fillColor('#666')
                .text('Thank you for your business', margin, footerY + 10, {
                    align: 'center',
                    width: contentWidth,
                })
                .text(
                    'For questions about this Cost Estimate, please contact your account manager.',
                    margin,
                    doc.y,
                    { align: 'center', width: contentWidth }
                )

            // Finalize PDF
            doc.end()
        } catch (error) {
            console.error('=== PDF Generation Failed ===')
            console.error('Error:', error)
            if (error instanceof Error) {
                console.error('Stack:', error.stack)
            }
            reject(error)
        }
    })
}
