import { Request, Response } from 'express'
import httpStatus from 'http-status'
import { ServiceTypesServices } from './service-types.services'

// ----------------------------------- LIST SERVICE TYPES -----------------------------------
const listServiceTypes = async (req: Request, res: Response) => {
  const { platform_id } = req as any
  const query = req.query

  const result = await ServiceTypesServices.listServiceTypes(query, platform_id)

  return res.status(httpStatus.OK).json({
    success: true,
    ...result,
  })
}

// ----------------------------------- GET SERVICE TYPE BY ID -----------------------------------
const getServiceTypeById = async (req: Request, res: Response) => {
  const { platform_id } = req as any
  const { id } = req.params

  const serviceType = await ServiceTypesServices.getServiceTypeById(id, platform_id)

  return res.status(httpStatus.OK).json({
    success: true,
    data: serviceType,
  })
}

// ----------------------------------- CREATE SERVICE TYPE -----------------------------------
const createServiceType = async (req: Request, res: Response) => {
  const { platform_id } = req as any
  const payload = { ...req.body, platform_id }

  const serviceType = await ServiceTypesServices.createServiceType(payload)

  return res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Service type created successfully',
    data: serviceType,
  })
}

// ----------------------------------- UPDATE SERVICE TYPE -----------------------------------
const updateServiceType = async (req: Request, res: Response) => {
  const { platform_id } = req as any
  const { id } = req.params
  const payload = req.body

  const serviceType = await ServiceTypesServices.updateServiceType(id, platform_id, payload)

  return res.status(httpStatus.OK).json({
    success: true,
    message: 'Service type updated successfully',
    data: serviceType,
  })
}

// ----------------------------------- DELETE SERVICE TYPE -----------------------------------
const deleteServiceType = async (req: Request, res: Response) => {
  const { platform_id } = req as any
  const { id } = req.params

  await ServiceTypesServices.deleteServiceType(id, platform_id)

  return res.status(httpStatus.OK).json({
    success: true,
    message: 'Service type deactivated successfully',
  })
}

export const ServiceTypesControllers = {
  listServiceTypes,
  getServiceTypeById,
  createServiceType,
  updateServiceType,
  deleteServiceType,
}
