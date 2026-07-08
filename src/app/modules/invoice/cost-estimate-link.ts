import httpStatus from "http-status";
import { Secret } from "jsonwebtoken";
import config from "../../config";
import CustomizedError from "../../error/customized-error";
import { tokenGenerator, tokenVerifier } from "../../utils/jwt-helpers";

// -------------------------------- COST-ESTIMATE EMAIL DOWNLOAD LINK --------------------------
// The "Download Cost Estimate PDF" link embedded in client quote / inbound-request
// emails is clicked cold from a mailbox — no app session, no `x-platform` header,
// no bearer token. It therefore CANNOT go through the authenticated in-app download
// routes (platformValidator + auth would 401/400 the click), and it must NOT be a
// tokenless public route either: within a single platform every company shares the
// same platform UUID, so `?pid=<uuid>` + a guessable readable id would let any
// tenant user enumerate every company's quote PDF (cross-company pricing leak).
//
// Instead we mint a signed, scoped, expiring token — same mechanism + secret as the
// email unsubscribe link (email-preferences.service.ts). The token IS the
// authorization: only the email recipient holds it. It encodes the entity + platform
// so the public download controller can resolve + stream without any header/session.
//
// The PDF served is the CLIENT-facing cost estimate (already client-safe — no buy /
// margin figures), so serving it to the token holder exposes nothing beyond the
// client's own quote.

export type CostEstimatePurpose = "ORDER" | "INBOUND_REQUEST";

type CostEstimateTokenPayload = {
    type: "cost_estimate";
    purpose: CostEstimatePurpose;
    // Readable entity id (ORD-YYYYMMDD-NNN / the inbound_request_id) — what the
    // controller looks the entity up by, scoped to platform_id.
    entity_id: string;
    platform_id: string;
};

const getCostEstimateSecret = () =>
    (config.email_unsubscribe_secret || config.jwt_access_secret) as Secret;

export const buildCostEstimateToken = (
    purpose: CostEstimatePurpose,
    entityIdReadable: string,
    platformId: string
) =>
    tokenGenerator(
        {
            type: "cost_estimate",
            purpose,
            entity_id: entityIdReadable,
            platform_id: platformId,
        },
        getCostEstimateSecret(),
        "30d"
    );

export const verifyCostEstimateToken = (token: string): CostEstimateTokenPayload => {
    let payload: CostEstimateTokenPayload;
    try {
        payload = tokenVerifier(token, getCostEstimateSecret()) as CostEstimateTokenPayload;
    } catch {
        // Expired / tampered / malformed — surface a clean 401 instead of the raw
        // jsonwebtoken error (which would 500 through the global handler).
        throw new CustomizedError(
            httpStatus.UNAUTHORIZED,
            "This download link is invalid or has expired. Please request a new one."
        );
    }
    if (payload?.type !== "cost_estimate" || !payload.entity_id || !payload.platform_id) {
        throw new CustomizedError(httpStatus.UNAUTHORIZED, "Invalid cost estimate download link.");
    }
    return payload;
};

// Full emailed URL. Router mounts at "/" (NOT "/api" — the historic `/api/...`
// prefix on these links was the "API Not found!" bug), so the path is
// /client/v1/invoice/cost-estimate/download. Empty base → empty string (mirrors
// buildUnsubscribeUrl) so a mis-provisioned SERVER_URL just omits the link.
export const buildCostEstimateDownloadUrl = (
    purpose: CostEstimatePurpose,
    entityIdReadable: string,
    platformId: string
) => {
    const baseUrl = (config.server_url || "").replace(/\/$/, "");
    if (!baseUrl) return "";
    const token = buildCostEstimateToken(purpose, entityIdReadable, platformId);
    return `${baseUrl}/client/v1/invoice/cost-estimate/download?token=${encodeURIComponent(token)}`;
};
