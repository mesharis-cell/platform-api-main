import { and, eq } from "drizzle-orm"
import httpStatus from "http-status"
import { db } from "../../../db"
import { orders } from "../../../db/schema"
import CustomizedError from "../../error/customized-error"
import { AuthUser } from "../../interface/common"
import { getPresignedUrl } from "../../services/s3.service"
import { costEstimateGenerator } from "../../utils/cost-estimate"

// ----------------------------------- DOWNLOAD COST ESTIMATE -------------------------------------
const downloadCostEstimate = async (
    orderId: string,
    user: AuthUser,
    platformId: string
) => {
    // Step 1: Fetch order with company details
    const order = await db.query.orders.findFirst({
        where: and(
            eq(orders.order_id, orderId),
            eq(orders.platform_id, platformId)
        ),
        with: {
            company: true,
        }
    })

    if (!order) {
        throw new CustomizedError(httpStatus.NOT_FOUND, "Order not found")
    }

    // Step 2: Access control - CLIENT users can only access their company's orders
    if (user.role === 'CLIENT') {
        if (!user.company_id || !order.company || order.company.id !== user.company_id) {
            throw new CustomizedError(
                httpStatus.FORBIDDEN,
                "You don't have access to this cost estimate"
            )
        }
    }

    // Step 3: Build S3 key
    const s3Key = `cost-estimates/${order.company.name.replace(/\s/g, '-').toLowerCase()}/${order.order_id}.pdf`

    // Step 4: Generate presigned URL for download (valid for 1 hour)
    const downloadUrl = await getPresignedUrl(s3Key, 3600)

    return {
        order_id: order.order_id,
        download_url: downloadUrl,
        expires_in: 3600, // seconds
    }
}

export const CostEstimateServices = {
    downloadCostEstimate,
}
