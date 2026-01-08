import express from 'express'
import auth from '../../middleware/auth'
import payloadValidator from '../../middleware/payload-validator'
import { CostEstimateControllers } from './cost-estimate.controllers'
import { downloadCostEstimateSchema } from './cost-estimate.schemas'

const router = express.Router()

// Client routes
router.get(
    '/client/v1/cost-estimate/download/:order_id',
    auth('ADMIN', 'CLIENT'),
    payloadValidator(downloadCostEstimateSchema),
    CostEstimateControllers.downloadCostEstimateController
)

export const CostEstimateRoutes = router
