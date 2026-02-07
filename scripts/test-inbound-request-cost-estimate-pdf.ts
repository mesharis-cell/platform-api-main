import { renderInboundRequestCostEstimatePDF } from "../src/app/utils/inbound-request-cost-estimate-pdf";
import { InboundRequestCostEstimatePayload } from "../src/app/utils/inbound-request-cost-estimate";
import * as fs from "fs";
import * as path from "path";

// Sample test data
const sampleData: InboundRequestCostEstimatePayload & { estimate_date: Date } = {
    inbound_request_id: "REQ-20260207-001",
    estimate_number: "EST-REQ-001",
    company_name: "Tech Solutions Inc.",
    contact_name: "Alice Johnson",
    contact_email: "alice.j@example.com",
    contact_phone: "+971 50 987 6543",
    incoming_at: new Date("2026-02-10"),
    note: "Urgent request for exhibition setup.",
    estimate_date: new Date(),
    items: [
        {
            name: "LED Wall 3x3m",
            quantity: 1,
            category: "Video",
        },
        {
            name: "Sound System PA",
            quantity: 2,
            category: "Audio",
        },
        {
            name: "Stage Platform",
            quantity: 4,
            category: "Staging",
        },
    ],
    pricing: {
        logistics_sub_total: "5000.00",
        service_fee: "500.00",
        final_total: "5500.00",
        show_breakdown: true,
    },
};

async function main() {
    console.log("Generating test inbound request cost estimate PDF...");

    try {
        const pdfBuffer = await renderInboundRequestCostEstimatePDF(sampleData);

        // Save to scripts folder
        const outputPath = path.join(__dirname, "test-inbound-request-cost-estimate.pdf");
        fs.writeFileSync(outputPath, pdfBuffer);

        console.log(`✅ Inbound Request Cost Estimate PDF saved to: ${outputPath}`);
        console.log(`   File size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    } catch (error) {
        console.error("❌ Error generating PDF:", error);
    }
}

main();
