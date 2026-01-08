import httpStatus from 'http-status'
import catchAsync from '../../shared/catch-async'
import sendResponse from '../../shared/send-response'
import { CostEstimateServices } from './cost-estimate.services'

// ----------------------------------- DOWNLOAD COST ESTIMATE -------------------------------------
const downloadCostEstimateController = catchAsync(async (req, res) => {
    const user = (req as any).user
    const platformId = (req.query as any).pid

    const result = await CostEstimateServices.downloadCostEstimate(
        req.params.order_id,
        user,
        platformId
    )

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Cost estimate download URL generated successfully',
        data: result,
    })
})

export const CostEstimateControllers = {
    downloadCostEstimateController,
}
