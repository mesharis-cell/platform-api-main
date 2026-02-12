import fs from "fs";
import path from "path";
import { renderInboundRequestInvoicePDF } from "../src/app/utils/inbound-request-invoice-pdf";
import { InboundRequestInvoicePayload } from "../src/app/utils/inbound-request-invoice";

const mockPayload: InboundRequestInvoicePayload = {
    inbound_request_id: "ir_1234567890",
    invoice_number: "INV-20260207-001",
    company_name: "Mock Company LLC",
    contact_name: "John Doe",
    contact_email: "john.doe@example.com",
    contact_phone: "+971 50 123 4567",
    incoming_at: new Date("2026-02-15T10:00:00Z"),
    note: "Please handle with care. VIP items.",
    items: [
        {
            name: "Premium Office Chair",
            quantity: 10,
            category: "FURNITURE",
        },
        {
            name: "Standing Desk",
            quantity: 5,
            category: "FURNITURE",
        },
        {
            name: "Misc Monitors",
            quantity: 20,
            category: "ELECTRONICS",
        },
    ],
    pricing: {
        logistics_sub_total: "1500.00",
        catalog_total: "300.00",
        custom_total: "200.00",
        service_fee: "500.00",
        final_total: "2000.00",
        show_breakdown: true,
    },
    line_items: [
        {
            line_item_id: "CAT-001",
            description: "Catalog Item 1",
            quantity: 1,
            unit_rate: 300,
            total: 300,
        },
        {
            line_item_id: "CUST-001",
            description: "Custom Item 1",
            quantity: 1,
            unit_rate: 200,
            total: 200,
        },
    ],
    line_items_sub_total: 500,
};

const outputPath = path.resolve(__dirname, "test-inbound-request-invoice.pdf");

async function generateTestPDF() {
    try {
        console.log("Generating Inbound Request Invoice PDF...");
        const buffer = await renderInboundRequestInvoicePDF({
            ...mockPayload,
            invoice_number: mockPayload.invoice_number,
            invoice_date: new Date(),
        });

        fs.writeFileSync(outputPath, buffer);
        console.log(`PDF generated successfully at: ${outputPath}`);
    } catch (error) {
        console.error("Error generating PDF:", error);
    }
}

generateTestPDF();
