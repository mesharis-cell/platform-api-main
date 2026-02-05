import catchAsync from "../../shared/catch-async";
import httpStatus from "http-status";
import { VehicleTypeServices } from "./vehicle-type.services";

const getVehicleTypes = catchAsync(async (req, res, next) => {
  const { platform_id } = req as any;
  const query = req.query;

  const result = await VehicleTypeServices.getVehicleTypes(query, platform_id);

  return res.status(httpStatus.OK).json({
    success: true,
    message: "Vehicle types retrieved successfully",
    data: result,
  });
})

const createVehicleType = catchAsync(async (req, res, next) => {
  const { platform_id } = req as any;
  const payload = { ...req.body, platform_id };

  const result = await VehicleTypeServices.createVehicleType(payload);

  return res.status(httpStatus.CREATED).json({
    success: true,
    message: "Vehicle type created successfully",
    data: result,
  });
})

const updateVehicleType = catchAsync(async (req, res, next) => {
  const { platform_id } = req as any;
  const { id } = req.params;
  const payload = { ...req.body, platform_id };

  const result = await VehicleTypeServices.updateVehicleType(id as string, payload);

  return res.status(httpStatus.OK).json({
    success: true,
    message: "Vehicle type updated successfully",
    data: result,
  });
});

export const VehicleTypeControllers = {
  getVehicleTypes,
  createVehicleType,
  updateVehicleType,
}
