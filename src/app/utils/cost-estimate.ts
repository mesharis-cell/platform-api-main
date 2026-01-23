import { uploadPDFToS3 } from "../services/s3.service";
import { renderCostEstimatePDF } from "./cost-estimate-pdf";
import { InvoicePayload } from "./invoice";

// ------------------------------ COST ESTIMATE GENERATOR ------------------------------------
export const costEstimateGenerator = async (
    data: InvoicePayload
): Promise<{ estimate_pdf_url: string; pdf_buffer: Buffer }> => {
    // Generate PDF
    const pdfBuffer = await renderCostEstimatePDF({
        ...data,
        estimate_number: data.order_id,
        estimate_date: new Date(),
    });

    // Build S3 key using order_id
    const key = `cost-estimates/${data.company_name.replace(/\s/g, "-").toLowerCase()}/${data.order_id}.pdf`;

    // Upload PDF to S3 (overwrites if exists)
    const pdfUrl = await uploadPDFToS3(pdfBuffer, data.order_id, key);

    return {
        estimate_pdf_url: pdfUrl,
        pdf_buffer: pdfBuffer,
    };
};
