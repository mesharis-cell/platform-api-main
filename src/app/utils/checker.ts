import httpStatus from "http-status";
import CustomizedError from "../error/customized-error";

export const validDateChecker = (date: string, key: 'from_date' | 'to_date') => {
  const regex = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!regex.test(date)) {
    throw new CustomizedError(
      httpStatus.BAD_REQUEST,
      `${key} is not a valid date. Valid format is YYYY-MM-DD`
    );
  }
  let valid_date = new Date(date);
  if (key === "from_date") {
    valid_date = new Date(`${date}T00:00:00Z`);
  }
  if (key === "to_date") {
    valid_date = new Date(`${date}T23:59:59Z`);
  }
  return valid_date;
};
