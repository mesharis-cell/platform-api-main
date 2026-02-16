import { generateCommercialCostEstimate } from "./cost-estimate";

export const serviceRequestCostEstimateGenerator = async (
    serviceRequestId: string,
    platformId: string,
    regenerate: boolean = false
): Promise<{ estimate_pdf_url: string; pdf_buffer: Buffer }> =>
    generateCommercialCostEstimate("SERVICE_REQUEST", serviceRequestId, platformId, regenerate);
