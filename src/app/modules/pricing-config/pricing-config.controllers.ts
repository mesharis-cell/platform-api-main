import { Request, Response } from 'express'
import httpStatus from 'http-status'
import { AuthUser } from '../../interface/common'
import { PricingConfigServices } from './pricing-config.services'

// ----------------------------------- GET PLATFORM DEFAULT CONFIG -----------------------------------
const getPlatformDefaultConfig = async (req: Request, res: Response) => {
  const { platform_id } = req as any

  const config = await PricingConfigServices.getPlatformDefaultConfig(platform_id)

  return res.status(httpStatus.OK).json({
    success: true,
    data: config,
  })
}

// ----------------------------------- GET COMPANY CONFIG -----------------------------------
const getCompanyConfig = async (req: Request, res: Response) => {
  const { platform_id } = req as any
  const { companyId } = req.params

  const config = await PricingConfigServices.getCompanyConfig(companyId, platform_id)

  return res.status(httpStatus.OK).json({
    success: true,
    data: config,
  })
}

// ----------------------------------- SET PLATFORM DEFAULT -----------------------------------
const setPlatformDefault = async (req: Request, res: Response) => {
  const { platform_id } = req as any
  const payload = req.body

  const config = await PricingConfigServices.setPlatformDefault(platform_id, payload)

  return res.status(httpStatus.OK).json({
    success: true,
    message: 'Platform default pricing configuration updated successfully',
    data: config,
  })
}

// ----------------------------------- SET COMPANY OVERRIDE -----------------------------------
const setCompanyOverride = async (req: Request, res: Response) => {
  const { platform_id } = req as any
  const { companyId } = req.params
  const payload = req.body

  const config = await PricingConfigServices.setCompanyOverride(
    companyId,
    platform_id,
    payload
  )

  return res.status(httpStatus.OK).json({
    success: true,
    message: 'Company pricing configuration updated successfully',
    data: config,
  })
}

// ----------------------------------- REMOVE COMPANY OVERRIDE -----------------------------------
const removeCompanyOverride = async (req: Request, res: Response) => {
  const { platform_id } = req as any
  const { companyId } = req.params

  await PricingConfigServices.removeCompanyOverride(companyId, platform_id)

  return res.status(httpStatus.OK).json({
    success: true,
    message: 'Company pricing configuration removed. Using platform default.',
  })
}

export const PricingConfigControllers = {
  getPlatformDefaultConfig,
  getCompanyConfig,
  setPlatformDefault,
  setCompanyOverride,
  removeCompanyOverride,
}
