import { renderInvoicePDF } from "../src/app/utils/invoice-pdf";
import { InvoicePayload } from "../src/app/utils/invoice";
import * as fs from "fs";
import * as path from "path";

// Sample test data matching InvoicePayload type
const sampleInvoiceData: InvoicePayload & { invoice_number: string; invoice_date: Date } = {
    id: "test-order-id",
    user_id: "test-user-id",
    platform_id: "test-platform-id",
    invoice_number: "INV-20260119-001",
    invoice_date: new Date(),
    order_id: "ORD-12345",
    company_name: "Acme Events LLC",
    contact_name: "John Smith",
    contact_email: "john.smith@acme-events.com",
    contact_phone: "+971 50 123 4567",
    event_start_date: new Date("2026-02-15"),
    event_end_date: new Date("2026-02-18"),
    venue_name: "Dubai World Trade Centre",
    venue_city: "Dubai",
    venue_country: "UAE",
    venue_address: "Sheikh Zayed Road, Trade Centre 2",
    order_status: "COMPLETED",
    financial_status: "PENDING",
    items: [
        {
            asset_name: '65" Samsung LED Display',
            quantity: 4,
            from_collection_name: "AV Equipment",
            handling_tags: ["Fragile", "HeavyLift"],
        },
        {
            asset_name: "Professional Stage Lighting Kit",
            quantity: 2,
            from_collection_name: "Lighting",
            handling_tags: [],
        },
        {
            asset_name: "Wireless Microphone System",
            quantity: 6,
            from_collection_name: "Audio Equipment",
            handling_tags: [],
        },
        {
            asset_name: "Portable Stage Platform 4x4m",
            quantity: 1,
            handling_tags: ["HeavyLift", "AssemblyRequired"],
        },
    ],
    pricing: {
        show_breakdown: true,
        logistics_base_price: "12500.00",
        transport_rate: "250.00",
        service_fee: "1125.00",
        final_total_price: "13875.00",
    },
    line_items: [
        {
            line_item_id: "LI-001",
            description: "Custom Setup Service",
            quantity: 1,
            unit_rate: 500.00,
            total: 500.00
        },
        {
            line_item_id: "LI-002",
            description: "Overtime Charge",
            quantity: 5,
            unit_rate: 100.00,
            total: 500.00
        }
    ],
    line_items_sub_total: 1000.00,
};

async function main() {
    console.log("Generating test invoice PDF...");

    try {
        const pdfBuffer = await renderInvoicePDF(sampleInvoiceData);

        // Save to scripts folder
        const outputPath = path.join(__dirname, "test-invoice.pdf");
        fs.writeFileSync(outputPath, pdfBuffer);

        console.log(`✅ Invoice PDF saved to: ${outputPath}`);
        console.log(`   File size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    } catch (error) {
        console.error("❌ Error generating PDF:", error);
    }
}

main();
