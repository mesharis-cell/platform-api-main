// ---------------------------------- GENERATE UNIQUE QR CODE ----------------------------------
// Format: ASSET-{companyCode}-{timestamp}-{random}
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { assets, companies } from "../../db/schema";

export const qrCodeGenerator = async (companyID: string) => {
    const company = await db.query.companies.findFirst({
        where: eq(companies.id, companyID),
    });

    if (!company) {
        throw new Error("Company not found");
    }

    const companyCode =
        company.name
            .replace(/[^a-zA-Z0-9]/g, "")
            .substring(0, 3)
            .toUpperCase() || "UNK";

    let qrCode: string;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    // Ensure uniqueness with retry logic
    while (!isUnique && attempts < maxAttempts) {
        const timestamp = Date.now();
        const random = randomBytes(3).toString("hex").toUpperCase();
        qrCode = `ASSET-${companyCode}-${timestamp}-${random}`;

        // Check if QR code already exists
        const existing = await db.query.assets.findFirst({
            where: eq(assets.qr_code, qrCode),
        });

        if (!existing) {
            isUnique = true;
            return qrCode;
        }

        attempts++;
    }

    throw new Error("Failed to generate unique QR code after multiple attempts");
};
