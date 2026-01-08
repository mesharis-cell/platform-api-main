# PDF Generation Usage Guide

This document explains how to use the two PDF generation functions for invoices and cost estimates.

## Overview

Two PDF designs are available:

1. **Invoice PDF** (`renderInvoicePDF`) - Formal invoice for payment collection
   - Blue branding (#2563eb)
   - Professional layout with styled header and footer
   - Includes invoice number, date, and payment instructions
   - Suitable for final billing

2. **Cost Estimate PDF** (`renderCostEstimatePDF`) - Quotation/estimate
   - Green branding (#059669)
   - Clean, simple layout
   - Includes estimate number, date, and validity notes
   - Suitable for preliminary quotes

## Usage Examples

### 1. Generate Invoice PDF

```typescript
import { renderInvoicePDF } from './utils/invoice-pdf'
import { InvoicePayload } from './utils/invoice'

const invoiceData: InvoicePayload & { invoice_number: string; invoice_date: Date } = {
    // Order information
    id: 'order-123',
    user_id: 'user-456',
    order_id: 'ORD-20260108-001',
    platform_id: 'platform-789',
    
    // Contact information
    contact_name: 'John Doe',
    contact_email: 'john.doe@example.com',
    contact_phone: '+971 50 123 4567',
    company_name: 'ABC Events LLC',
    
    // Event details
    event_start_date: new Date('2026-02-15'),
    event_end_date: new Date('2026-02-17'),
    venue_name: 'Dubai World Trade Centre',
    venue_country: 'United Arab Emirates',
    venue_city: 'Dubai',
    venue_address: 'Sheikh Zayed Road, Dubai',
    
    // Items
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
        }
    ],
    
    // Pricing
    pricing: {
        logistics_base_price: '15000.00',
        platform_margin_percent: '15',
        platform_margin_amount: '2250.00',
        final_total_price: '17250.00',
        show_breakdown: true // Set to false to hide breakdown
    },
    
    // Invoice specific
    invoice_number: 'INV-20260108-001',
    invoice_date: new Date()
}

// Generate PDF
const pdfBuffer = await renderInvoicePDF(invoiceData)

// Save to file or upload to S3
// fs.writeFileSync('invoice.pdf', pdfBuffer)
// await uploadPDFToS3(pdfBuffer, invoiceData.invoice_number, 'invoices/...')
```

### 2. Generate Cost Estimate PDF

```typescript
import { renderCostEstimatePDF } from './utils/invoice-pdf'
import { InvoicePayload } from './utils/invoice'

const estimateData: InvoicePayload & { estimate_number: string; estimate_date: Date } = {
    // Same structure as invoice data above, but with estimate_number instead
    // ... (all the same fields)
    
    // Estimate specific
    estimate_number: 'EST-20260108-001',
    estimate_date: new Date()
}

// Generate PDF
const pdfBuffer = await renderCostEstimatePDF(estimateData)

// Save to file or upload to S3
```

## Key Differences Between Invoice and Estimate

| Feature | Invoice PDF | Cost Estimate PDF |
|---------|-------------|-------------------|
| **Color Theme** | Blue (#2563eb) | Green (#059669) |
| **Title** | "INVOICE" | "Cost Estimate" |
| **Purpose** | Final billing | Preliminary quote |
| **Header Style** | Formal with colored bars | Simple and clean |
| **Table Design** | Styled with alternating rows | Simple with dividers |
| **Footer Message** | Payment instructions | Validity and notes |
| **Tone** | Formal and official | Informative and friendly |

## Data Structure

Both functions use the same `InvoicePayload` type with additional fields:

```typescript
type InvoicePayload = {
    id: string;
    user_id: string;
    order_id: string;
    platform_id: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    company_name: string;
    event_start_date: Date;
    event_end_date: Date;
    venue_name: string;
    venue_country: string;
    venue_city: string;
    venue_address: string;
    items: Array<{
        asset_name: string;
        quantity: number;
        handling_tags: HandlingTag[];
        from_collection_name?: string;
    }>;
    pricing: {
        logistics_base_price: string;
        platform_margin_percent: string;
        platform_margin_amount: string;
        final_total_price: string;
        show_breakdown: boolean;
    };
}

// For Invoice
type InvoiceData = InvoicePayload & {
    invoice_number: string;
    invoice_date: Date;
}

// For Estimate
type EstimateData = InvoicePayload & {
    estimate_number: string;
    estimate_date: Date;
}
```

## Handling Tags

Available handling tags:
- `Fragile` - Delicate items requiring special care
- `HighValue` - Expensive items requiring extra security
- `HeavyLift` - Heavy items requiring special equipment
- `AssemblyRequired` - Items that need assembly on-site

## Pricing Breakdown

Set `pricing.show_breakdown` to:
- `true` - Shows itemized breakdown (logistics base + service fee)
- `false` - Shows only total amount

## Tips

1. **Currency**: Currently formatted as AED. Modify `formatCurrency()` function to change currency.
2. **Company Name**: Update "YOUR COMPANY NAME" in the invoice header (line 59 in invoice-pdf.ts)
3. **Payment Terms**: Modify payment instructions section as needed
4. **Colors**: Easy to customize by changing the hex color codes
5. **Fonts**: PDFKit uses Helvetica by default. Can be changed to custom fonts if needed.

## Error Handling

Both functions return a Promise that resolves to a Buffer. Handle errors appropriately:

```typescript
try {
    const pdfBuffer = await renderInvoicePDF(data)
    // Success
} catch (error) {
    console.error('PDF generation failed:', error)
    // Handle error
}
```

## Integration with Existing Code

The `renderInvoicePDF` function is already integrated with the existing `invoiceGenerator` function in `invoice.ts`. To add cost estimate generation, you can create a similar function:

```typescript
export const estimateGenerator = async (
    data: InvoicePayload,
    regenerate: boolean = false
): Promise<{ estimate_id: string; estimate_pdf_url: string; pdf_buffer: Buffer }> => {
    // Similar logic to invoiceGenerator but for estimates
    // Generate estimate number, create PDF, upload to S3, etc.
}
```
