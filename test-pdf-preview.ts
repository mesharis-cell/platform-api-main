import { renderFormalInvoicePDF } from './src/app/utils/invoice-formal-pdf'
import { renderAlternativeInvoicePDF } from './src/app/utils/invoice-alternative-pdf'
import { renderSimpleInvoicePDF } from './src/app/utils/invoice-simple-pdf'
import { renderCostEstimatePDF } from './src/app/utils/cost-estimate-pdf'
import { InvoicePayload } from './src/app/utils/invoice'
import * as fs from 'fs'
import * as path from 'path'

// Sample data for testing
const sampleData: InvoicePayload = {
    id: 'order-123-sample',
    user_id: 'user-456-sample',
    order_id: 'ORD-20260108-001',
    platform_id: 'platform-789',
    contact_name: 'John Doe',
    contact_email: 'john.doe@example.com',
    contact_phone: '+971 50 123 4567',
    company_name: 'ABC Events LLC',
    event_start_date: new Date('2026-02-15'),
    event_end_date: new Date('2026-02-17'),
    venue_name: 'Dubai World Trade Centre',
    venue_country: 'United Arab Emirates',
    venue_city: 'Dubai',
    venue_address: 'Sheikh Zayed Road, Convention Gate, Dubai',
    items: [
        {
            asset_name: 'LED Screen 4x3m',
            quantity: 2,
            handling_tags: ['Fragile', 'HeavyLift'],
            from_collection_name: 'Premium AV Collection'
        },
        {
            asset_name: 'Sound System - 5000W',
            quantity: 1,
            handling_tags: ['HighValue'],
            from_collection_name: 'Audio Equipment'
        },
        {
            asset_name: 'Stage Lighting Kit',
            quantity: 3,
            handling_tags: ['Fragile', 'AssemblyRequired'],
            from_collection_name: 'Lighting Collection'
        },
        {
            asset_name: 'Wireless Microphone Set',
            quantity: 5,
            handling_tags: ['HighValue'],
        }
    ],
    pricing: {
        logistics_base_price: '15000.00',
        platform_margin_percent: '15',
        platform_margin_amount: '2250.00',
        final_total_price: '17250.00',
        show_breakdown: true
    }
}

async function generatePreviews() {
    console.log('🎨 Generating PDF Previews...\n')

    // Create output directory
    const outputDir = path.join(__dirname, 'pdf-previews')
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    try {
        // Generate Formal Invoice PDF
        console.log('📄 Generating Formal Invoice PDF (Blue Theme)...')
        const invoiceBuffer = await renderFormalInvoicePDF({
            ...sampleData,
            invoice_number: 'INV-20260108-001',
            invoice_date: new Date()
        })
        const invoicePath = path.join(outputDir, 'sample-invoice.pdf')
        fs.writeFileSync(invoicePath, invoiceBuffer)
        console.log(`✅ Formal Invoice saved to: ${invoicePath}\n`)

        // Generate Cost Estimate PDF
        console.log('📊 Generating Cost Estimate PDF (Green Theme)...')
        const estimateBuffer = await renderCostEstimatePDF({
            ...sampleData,
            estimate_number: 'EST-20260108-001',
            estimate_date: new Date()
        })
        const estimatePath = path.join(outputDir, 'sample-cost-estimate.pdf')
        fs.writeFileSync(estimatePath, estimateBuffer)
        console.log(`✅ Cost Estimate saved to: ${estimatePath}\n`)

        // Generate Alternative Invoice PDF
        console.log('📄 Generating Alternative Invoice PDF (Sidebar Layout)...')
        const altInvoiceBuffer = await renderAlternativeInvoicePDF({
            ...sampleData,
            invoice_number: 'INV-20260108-002',
            invoice_date: new Date()
        })
        const altInvoicePath = path.join(outputDir, 'sample-invoice-alternative.pdf')
        fs.writeFileSync(altInvoicePath, altInvoiceBuffer)
        console.log(`✅ Alternative Invoice saved to: ${altInvoicePath}\n`)

        console.log('🎉 Preview PDFs generated successfully!')
        console.log(`📁 Check the folder: ${outputDir}`)
        console.log('\nYou can now open these PDFs to see the designs.')
        console.log('\n📋 Generated files:')
        console.log('  1. sample-invoice.pdf (Formal design with double borders)')
        console.log('  2. sample-invoice-alternative.pdf (Sidebar layout design)')
        console.log('  3. sample-invoice-simple.pdf (Simple minimalist design)')
        console.log('  4. sample-cost-estimate.pdf (Modern minimalist design)')

        // Generate Simple Invoice PDF
        console.log('\n📄 Generating Simple Invoice PDF (Minimalist)...')
        const simpleInvoiceBuffer = await renderSimpleInvoicePDF({
            ...sampleData,
            invoice_number: 'INV-20260108-003',
            invoice_date: new Date()
        })
        const simpleInvoicePath = path.join(outputDir, 'sample-invoice-simple.pdf')
        fs.writeFileSync(simpleInvoicePath, simpleInvoiceBuffer)
        console.log(`✅ Simple Invoice saved to: ${simpleInvoicePath}\n`)

        console.log('✨ All PDFs generated!')

    } catch (error) {
        console.error('❌ Error generating PDFs:', error)
        if (error instanceof Error) {
            console.error('Stack:', error.stack)
        }
    }
}

// Run the preview generation
generatePreviews()
